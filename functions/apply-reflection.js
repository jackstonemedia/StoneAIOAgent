const { db } = require('./lib/admin');
const { HttpsError } = require('firebase-functions/v1/https');
const admin = require('firebase-admin');
const { runEvolution } = require('./prompt-evolution');

async function applyReflection(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = context.auth.uid;
  const { agentId, reflectionId, approvedChangeIds } = data;

  if (!agentId || !reflectionId || !Array.isArray(approvedChangeIds)) {
    throw new HttpsError('invalid-argument', 'agentId, reflectionId, and approvedChangeIds array are required.');
  }

  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  const reflectionRef = agentRef.collection('reflections').doc(reflectionId);

  // Load reflection, verify status = "pending"
  const reflectionDoc = await reflectionRef.get();
  if (!reflectionDoc.exists) {
    throw new HttpsError('not-found', 'Reflection not found.');
  }
  
  const reflection = reflectionDoc.data();
  if (reflection.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Reflection is not pending.');
  }

  const agentDoc = await agentRef.get();
  const agent = agentDoc.data();
  let newSystemPrompt = agent.systemPrompt || '';

  // For each approved change
  for (const index of approvedChangeIds) {
    const change = reflection.proposedChanges[index];
    if (!change) continue;

    if (change.changeType === 'prompt') {
      newSystemPrompt += `\n\n## User-Approved Update\n${change.description}`;
    } else if (change.changeType === 'strategy') {
      await agentRef.collection('strategies').add({
        name: `Strategy from Reflection`,
        description: change.description,
        configurationSnapshot: change.description,
        status: "active",
        source: "reflection",
        runCount: 0,
        totalScore: 0,
        averageScore: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  if (newSystemPrompt !== agent.systemPrompt) {
    await agentRef.update({ systemPrompt: newSystemPrompt });
  }

  // Update reflection
  await reflectionRef.update({
    status: "approved",
    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    approvedChangeIds
  });

  // Call promptEvolution for this agent
  try {
    await runEvolution(uid, agentId);
  } catch (e) {
    console.error("Failed to run evolution after applying reflection:", e);
    // Don't throw, since the reflection was successfully applied
  }

  return { applied: approvedChangeIds.length };
}

module.exports = {
  applyReflection
};
