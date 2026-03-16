const functions = require('firebase-functions');
const { db } = require('./lib/admin');
const { runAgent } = require('./agent-runner');

exports.initiateCall = functions.https.onCall(async (data, context) => {
    // 1. Verify Authentication
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    const { agentId, phoneNumber, prospectName, prospectCompany, customContext } = data;
    const uid = context.auth.uid;

    if (!agentId || !phoneNumber) {
        throw new functions.https.HttpsError('invalid-argument', 'agentId and phoneNumber are required');
    }

    // 2. Load Agent Document and Verify Type
    const agentRef = db.doc(`users/${uid}/agents/${agentId}`);
    const agentSnap = await agentRef.get();

    if (!agentSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Agent not found');
    }

    const agentData = agentSnap.data();
    if (agentData.type !== 'voice') {
        throw new functions.https.HttpsError(
            'failed-precondition',
            'This endpoint is only for voice agents.'
        );
    }

    // 3. Build the call script using agentRun logic
    const taskDescription = `Generate a cold call script for ${prospectName} at ${prospectCompany}`;

    // We call the internal runAgent function (which handles strategy fetching and Gemini completion)
    // simulate an onCall invocation format:
    let scriptOutput = '';
    let internalRunId = '';
    try {
        const runResult = await runAgent({
            agentId,
            taskDescription,
            taskContext: customContext
        }, context);

        scriptOutput = runResult.output;
        internalRunId = runResult.runId;
    } catch (error) {
        console.error("Error generating call script:", error);
        throw new functions.https.HttpsError('internal', 'Failed to generate call script.');
    }

    // 4. Create Retell Call via API
    const retellApiKey = process.env.RETELL_API_KEY;
    const fromNumber = process.env.RETELL_FROM_NUMBER;
    const retellAgentId = process.env.RETELL_AGENT_ID;

    if (!retellApiKey || !fromNumber || !retellAgentId) {
        console.error("Missing Retell.ai environment variables");
        throw new functions.https.HttpsError('internal', 'Voice integration is not properly configured.');
    }

    let retellResponse;
    try {
        const response = await fetch('https://api.retellai.com/create-phone-call', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${retellApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from_number: fromNumber,
                to_number: phoneNumber,
                override_agent_id: retellAgentId,
                metadata: {
                    agentId,
                    runId: internalRunId,
                    uid,
                    prospectName,
                    prospectCompany
                },
                retell_llm_dynamic_variables: {
                    call_script: scriptOutput,
                    prospect_name: prospectName,
                    company_name: prospectCompany
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Retell API error:", response.status, errorText);
            throw new Error(`Retell API returned ${response.status}`);
        }

        retellResponse = await response.json();
    } catch (error) {
        console.error("Error creating Retell call:", error);
        throw new functions.https.HttpsError('internal', 'Failed to initiate the phone call.');
    }

    // 5. Update the run record created by runAgent to include voice specifics
    const runRef = agentRef.collection('runs').doc(internalRunId);
    await runRef.update({
        taskDescription: `Call to ${prospectName}`,
        status: 'call_initiated',
        retellCallId: retellResponse.call_id,
        phoneNumber,
        prospectName,
        prospectCompany
    });

    // 6. Return response
    return {
        callId: retellResponse.call_id,
        runId: internalRunId,
        scriptPreview: scriptOutput
    };
});

exports.retellWebhook = functions.https.onRequest(async (req, res) => {
    // Ensure it's a POST
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { event, call } = req.body;

        if (!call || !event) {
            return res.status(400).send('Invalid payload');
        }

        if (event === 'call_ended' || event === 'call_analyzed') {
            const { call_id, metadata, call_analysis } = call;

            if (!metadata || !metadata.uid || !metadata.agentId || !metadata.runId) {
                console.log("Missing metadata in Retell webhook for call:", call_id);
                return res.json({ received: true });
            }

            const { uid, agentId, runId } = metadata;

            let callSuccessful = false;
            let userSentiment = 'Unknown';
            let callSummary = 'Call ended before analysis completed.';
            let meetingBooked = false;

            if (call_analysis) {
                callSuccessful = !!call_analysis.call_successful;
                userSentiment = call_analysis.user_sentiment || 'Neutral';
                callSummary = call_analysis.call_summary || callSummary;

                // Example dynamic extraction from custom analysis data if meeting booked
                if (call_analysis.custom_analysis_data && call_analysis.custom_analysis_data.meeting_booked === true) {
                    meetingBooked = true;
                } else if (callSummary.toLowerCase().includes('meeting booked') || callSummary.toLowerCase().includes('calendar')) {
                    // Heuristic fallback if custom_analysis_data not setup
                    meetingBooked = true;
                }
            }

            // Compute primaryScore (0-100)
            let primaryScore = callSuccessful ? 60 : 20;
            primaryScore += meetingBooked ? 30 : 0;
            if (userSentiment === 'Positive') primaryScore += 10;
            else if (userSentiment === 'Negative') primaryScore -= 10;

            // Clamp between 0-100
            primaryScore = Math.max(0, Math.min(100, primaryScore));

            const runRef = db.doc(`users/${uid}/agents/${agentId}/runs/${runId}`);

            await runRef.update({
                outputSnapshot: callSummary,
                status: 'call_completed',
                callDuration: call.duration_ms || 0,
                callSuccessful,
                meetingBooked,
                userSentiment,
                primaryScore
            });

            // Call internal signalCollect logic
            // To avoid duplicate definitions, we can import collectSignal
            const { collectSignal } = require('./signal-collector');

            // simulate onCall context
            const mockContext = { auth: { uid } };
            await collectSignal({
                agentId,
                runId,
                primaryScore,
                secondaryScores: {
                    sentiment: userSentiment === 'Positive' ? 100 : (userSentiment === 'Negative' ? 0 : 50),
                    successful: callSuccessful ? 100 : 0
                },
                humanRating: null, // AI graded
                humanNote: "Auto-graded from Retell call analysis"
            }, mockContext);
        }

        res.json({ received: true });
    } catch (error) {
        console.error("Error in retellWebhook:", error);
        res.status(500).send('Internal Server Error');
    }
});
