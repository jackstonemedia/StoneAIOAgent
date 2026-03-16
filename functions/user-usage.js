const functions = require("firebase-functions");
const { getFirestore } = require('firebase-admin/firestore');

exports.getUserUsage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
    }

    const uid = context.auth.uid;
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);

    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        // Return graceful defaults if user doc isn't created yet
        return {
            agentRunsToday: 0, agentRunsLimit: 50,
            evolutionsToday: 0, evolutionsLimit: 5,
            selfReflectsToday: 0, selfReflectLimit: 10,
            totalRuns: 0, totalTokensUsed: 0,
            plan: 'free',
            cloudComputerStatus: 'offline'
        };
    }

    const userData = userSnap.data();

    // Check if reset is needed (naive date check based on UTC)
    const today = new Date().toISOString().split('T')[0];
    let updates = null;

    if (userData.lastResetDate !== today) {
        updates = {
            lastResetDate: today,
            agentRunsToday: 0,
            evolutionsToday: 0,
            selfReflectsToday: 0
        };
        await userRef.update(updates);
    }

    return {
        agentRunsToday: updates ? updates.agentRunsToday : (userData.agentRunsToday || 0),
        agentRunsLimit: userData.agentRunsLimit || 50,
        evolutionsToday: updates ? updates.evolutionsToday : (userData.evolutionsToday || 0),
        evolutionsLimit: userData.evolutionsLimit || 5,
        selfReflectsToday: updates ? updates.selfReflectsToday : (userData.selfReflectsToday || 0),
        selfReflectLimit: userData.selfReflectLimit || 10,
        totalRuns: userData.totalRuns || 0,
        totalTokensUsed: userData.totalTokensUsed || 0,
        plan: userData.plan || 'free',
        cloudComputerStatus: userData.cloudComputerStatus || 'offline'
    };
});
