const functions = require("firebase-functions");
const { db } = require("./lib/admin");
const gemini = require("./lib/gemini");
const crypto = require("crypto");
const { checkRateLimit } = require("./lib/rate-limiter");

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

exports.snapshotAgentVersion = async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const { agentId } = data;
  if (!agentId) throw new functions.https.HttpsError('invalid-argument', 'agentId is required.');

  await checkRateLimit(uid, "snapshotAgentVersion");

  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  const agentDoc = await agentRef.get();
  if (!agentDoc.exists) throw new functions.https.HttpsError('not-found', 'Agent not found.');
  const agent = agentDoc.data();

  const strategiesSnap = await agentRef.collection('strategies').get();
  const strategies = strategiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const versionId = crypto.randomUUID();
  const versionRef = agentRef.collection('versions').doc(versionId);

  await versionRef.set({
    versionId,
    agentId,
    createdAt: new Date(),
    systemPrompt: agent.systemPrompt || '',
    averageScore: agent.averageScore || 0,
    evolutionCount: agent.evolutionCount || 0,
    extractedPatterns: agent.extractedPatterns || [],
    pinnedExampleIds: agent.pinnedExampleIds || [],
    strategies: strategies
  });

  return { versionId };
};

exports.checkDrift = async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const { agentId } = data;
  if (!agentId) throw new functions.https.HttpsError('invalid-argument', 'agentId is required.');

  await checkRateLimit(uid, "checkDrift");

  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  const agentDoc = await agentRef.get();
  if (!agentDoc.exists) throw new functions.https.HttpsError('not-found', 'Agent not found.');
  const agent = agentDoc.data();

  if (!agent.systemPrompt || !agent.baseSystemPrompt) {
    return { similarity: 1, driftDetected: false };
  }

  const vecBase = await gemini.getEmbedding(agent.baseSystemPrompt);
  const vecCurrent = await gemini.getEmbedding(agent.systemPrompt);
  
  const similarity = cosineSimilarity(vecBase, vecCurrent);
  
  let driftDetected = false;
  const now = new Date();

  if (similarity < 0.70) {
    driftDetected = true;
    
    // Create notification
    await db.collection('users').doc(uid).collection('notifications').add({
      type: 'drift_detected',
      title: 'Agent Drift Detected',
      message: `Agent ${agent.name || 'Unknown'} has drifted significantly from its base instructions (${(similarity * 100).toFixed(1)}% similarity).`,
      agentId,
      read: false,
      createdAt: now
    });

    // Append alert
    const alerts = agent.alerts || [];
    alerts.push({
      type: 'drift',
      severity: 'high',
      similarity,
      createdAt: now,
      acknowledged: false
    });
    await agentRef.update({ alerts });

  } else if (similarity < 0.85) {
    const alerts = agent.alerts || [];
    alerts.push({
      type: 'drift',
      severity: 'medium',
      similarity,
      createdAt: now,
      acknowledged: false
    });
    await agentRef.update({ alerts });
  }

  return { similarity, driftDetected };
};

exports.rollbackAgent = async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const { agentId, versionId } = data;
  if (!agentId || !versionId) throw new functions.https.HttpsError('invalid-argument', 'agentId and versionId are required.');

  await checkRateLimit(uid, "rollbackAgent");

  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  const versionRef = agentRef.collection('versions').doc(versionId);
  
  const versionDoc = await versionRef.get();
  if (!versionDoc.exists) throw new functions.https.HttpsError('not-found', 'Version not found.');
  const version = versionDoc.data();

  const batch = db.batch();

  // Update agent
  batch.update(agentRef, {
    systemPrompt: version.systemPrompt || '',
    proposedSystemPrompt: null,
    extractedPatterns: version.extractedPatterns || [],
    pinnedExampleIds: version.pinnedExampleIds || [],
    needsPromptApproval: false
  });

  // Delete current strategies
  const currentStrategiesSnap = await agentRef.collection('strategies').get();
  currentStrategiesSnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  // Recreate strategies
  const strategies = version.strategies || [];
  strategies.forEach(strat => {
    const stratRef = agentRef.collection('strategies').doc(strat.id);
    const stratData = { ...strat };
    delete stratData.id; // Don't write id into the document body if it was there
    batch.set(stratRef, stratData);
  });

  // Create audit run record
  const runId = crypto.randomUUID();
  const runRef = agentRef.collection('runs').doc(runId);
  batch.set(runRef, {
    runId,
    agentId,
    taskDescription: `[SYSTEM] Rolled back to version ${versionId}`,
    outputText: `Restored systemPrompt and ${strategies.length} strategies.`,
    primaryScore: null,
    createdAt: new Date()
  });

  await batch.commit();

  return { restored: true, versionId };
};
