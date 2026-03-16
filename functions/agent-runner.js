const { db } = require('./lib/admin');
const { checkRateLimit, incrementUsage } = require('./lib/rate-limiter');
const { embedText, generateText } = require('./lib/gemini');
const { matchExamples } = require('./lib/supabase');
const { v4: uuidv4 } = require('uuid');
const { HttpsError } = require('firebase-functions/v1/https');
const admin = require('firebase-admin');

async function runAgent(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = context.auth.uid;
  const { agentId, taskDescription, taskContext } = data;

  if (!agentId || !taskDescription) {
    throw new HttpsError('invalid-argument', 'agentId and taskDescription are required.');
  }

  // Step 1 — Rate limit check
  await checkRateLimit(uid, 'agentRun');

  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  
  try {
    // Set agent status to running
    await agentRef.update({ status: 'running' });

    // Step 2 — Load agent and strategies
    const agentDoc = await agentRef.get();
    if (!agentDoc.exists) {
      throw new HttpsError('not-found', 'Agent not found.');
    }
    const agent = agentDoc.data();

    const strategiesSnapshot = await agentRef.collection('strategies')
      .where('status', '!=', 'archived')
      .get();
      
    let strategies = [];
    strategiesSnapshot.forEach(doc => {
      strategies.push({ id: doc.id, ...doc.data() });
    });
    // Sort by averageScore desc in memory to avoid needing a composite index
    strategies.sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));

    // Step 3 — Select strategy (explore/exploit)
    let selectedStrategy = null;
    const exploitRatio = agent.exploitRatio !== undefined ? agent.exploitRatio : 0.8;
    const random = Math.random();

    if (random < exploitRatio && strategies.length > 0) {
      // Exploit: Pick highest averageScore
      selectedStrategy = strategies[0];
    } else if (strategies.length > 0) {
      // Explore: Pick random where runCount < 10, else any random
      const newStrategies = strategies.filter(s => (s.runCount || 0) < 10);
      if (newStrategies.length > 0) {
        const randomIndex = Math.floor(Math.random() * newStrategies.length);
        selectedStrategy = newStrategies[randomIndex];
      } else {
        const randomIndex = Math.floor(Math.random() * strategies.length);
        selectedStrategy = strategies[randomIndex];
      }
    }

    if (!selectedStrategy) {
      throw new HttpsError('failed-precondition', 'No active strategies found for this agent.');
    }

    const selectedStrategyId = selectedStrategy.id || selectedStrategy.strategyId;

    // Step 4 — Load few-shot examples from Supabase
    let examplesText = "";
    try {
      const embedding = await embedText(taskDescription);
      const examples = await matchExamples(embedding, agentId, 5);
      if (examples && examples.length > 0) {
        examplesText = examples.map((ex, i) => 
`=== EXAMPLE ${i + 1} (Score: ${ex.primaryScore || 'N/A'}) ===
Task: ${ex.taskDescription}
Output: ${ex.outputText}
`).join('\n');
      }
    } catch (err) {
      console.warn("Failed to load examples from Supabase:", err.message);
      // Proceed without examples if Supabase fails or isn't configured
    }

    // Step 5 — Load team memory
    let teamMemoryText = "";
    try {
      const memorySnapshot = await db.collection('users').doc(uid).collection('teamMemory')
        .where('applicableAgentTypes', 'array-contains', agent.type)
        .orderBy('supportingScore', 'desc')
        .limit(5)
        .get();
        
      if (!memorySnapshot.empty) {
        const memories = [];
        memorySnapshot.forEach(doc => memories.push(doc.data()));
        teamMemoryText = memories.map(m => `- ${m.insight} (confidence: ${m.supportingScore || 0}/100)`).join('\n');
      }
    } catch (err) {
      console.warn("Failed to load team memory:", err.message);
      // Proceed without team memory if index is missing
    }

    // Step 6 — Build final prompt
    let finalPrompt = `[ROLE AND INSTRUCTIONS]\n${agent.systemPrompt || agent.baseSystemPrompt || ''}\n\n`;
    
    if (teamMemoryText) {
      finalPrompt += `[STONE AIO TEAM INSIGHTS]\n${teamMemoryText}\n\n`;
    }
    
    if (examplesText) {
      finalPrompt += `[HIGH-PERFORMING EXAMPLES]\n${examplesText}\n\n`;
    }
    
    finalPrompt += `[CURRENT STRATEGY]\n${selectedStrategy.configurationSnapshot || ''}\n\n`;
    
    finalPrompt += `[YOUR TASK]\n${taskDescription}`;
    if (taskContext) {
      finalPrompt += `\nContext: ${taskContext}`;
    }

    // Step 7 — Call Gemini
    let temperature = 0.7;
    if (['email', 'content'].includes(agent.type)) temperature = 0.8;
    else if (agent.type === 'voice') temperature = 0.6;
    else if (['autonomous', 'browser'].includes(agent.type)) temperature = 0.5;
    else if (agent.type === 'workflow') temperature = 0.3;

    const startTime = Date.now();
    const responseText = await generateText(finalPrompt, temperature);
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const estimatedTokenCount = Math.floor(finalPrompt.length / 4);

    // Step 8 — Create run record in Firestore
    const runId = uuidv4();
    const runData = {
      runId,
      agentId,
      strategyId: selectedStrategyId,
      taskDescription,
      outputSnapshot: responseText,
      primaryScore: null,
      secondaryScores: {},
      humanRating: null,
      humanNote: "",
      savedToLibrary: false,
      durationMs,
      tokenCount: estimatedTokenCount,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await agentRef.collection('runs').doc(runId).set(runData);

    // Step 9 — Update agent and usage
    await agentRef.update({
      status: 'idle',
      lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
      totalRuns: admin.firestore.FieldValue.increment(1)
    });

    await incrementUsage(uid, 'agentRun');
    
    await db.collection('users').doc(uid).update({
      totalRuns: admin.firestore.FieldValue.increment(1),
      totalTokensUsed: admin.firestore.FieldValue.increment(estimatedTokenCount)
    });

    return {
      runId,
      output: responseText,
      strategyUsed: selectedStrategyId,
      durationMs,
      tokenCount: estimatedTokenCount
    };

  } catch (error) {
    // Revert agent status on failure
    try {
      await agentRef.update({ status: 'idle' });
    } catch (revertError) {
      console.error("Failed to revert agent status:", revertError);
    }
    console.error("Agent run failed:", error);
    throw new HttpsError('internal', error.message || 'An error occurred during agent execution.');
  }
}

module.exports = {
  runAgent
};
