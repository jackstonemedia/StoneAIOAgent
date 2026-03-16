const { db } = require('./lib/admin');
const { checkRateLimit } = require('./lib/rate-limiter');
const { generateText } = require('./lib/gemini');
const { HttpsError } = require('firebase-functions/v1/https');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

async function agentSelfReflect(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = context.auth.uid;
  const { agentId } = data;

  if (!agentId) {
    throw new HttpsError('invalid-argument', 'agentId is required.');
  }

  // 1. Rate limit check
  await checkRateLimit(uid, "selfReflect");

  // 2. Load agent document
  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  const agentDoc = await agentRef.get();
  if (!agentDoc.exists) {
    throw new HttpsError('not-found', 'Agent not found.');
  }
  const agent = agentDoc.data();

  // Load last 30 runs
  const runsSnapshot = await agentRef.collection('runs')
    .where('primaryScore', '!=', null)
    .orderBy('primaryScore')
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get();

  let runs = [];
  runsSnapshot.forEach(doc => runs.push(doc.data()));
  runs.sort((a, b) => {
    const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });

  if (runs.length === 0) {
    throw new HttpsError('failed-precondition', 'Not enough runs to reflect on.');
  }

  let totalScore = 0;
  let bestScore = -Infinity;
  let worstScore = Infinity;
  
  runs.forEach(r => {
    const score = r.weightedScore || r.primaryScore || 0;
    totalScore += score;
    if (score > bestScore) bestScore = score;
    if (score < worstScore) worstScore = score;
  });

  const avgScore = totalScore / runs.length;

  let trend = 0;
  if (runs.length >= 20) {
    const last10 = runs.slice(0, 10);
    const prior10 = runs.slice(10, 20);
    const avgLast10 = last10.reduce((s, r) => s + (r.weightedScore || r.primaryScore || 0), 0) / 10;
    const avgPrior10 = prior10.reduce((s, r) => s + (r.weightedScore || r.primaryScore || 0), 0) / 10;
    trend = avgLast10 - avgPrior10;
  }

  // 3. Identify top 5 and bottom 3 runs
  const sortedByScore = [...runs].sort((a, b) => (b.weightedScore || b.primaryScore || 0) - (a.weightedScore || a.primaryScore || 0));
  const top5 = sortedByScore.slice(0, 5);
  const bottom3 = sortedByScore.slice(-3);

  const formatRun = (r) => `Score ${r.weightedScore || r.primaryScore || 0}\nTask: ${r.taskDescription || ''}\nOutput: ${(r.outputSnapshot || '').substring(0, 200)}\n---`;

  // 4. Build self-reflection prompt
  const prompt = `You are ${agent.name}, an AI agent with the following role: ${agent.role || 'performing tasks'}
Your primary success metric is: ${agent.primaryMetric || 'success'}

YOUR RECENT PERFORMANCE DATA:
- Average score (last 30 runs): ${avgScore.toFixed(1)}
- Best score: ${bestScore} | Worst score: ${worstScore}
- Trend: ${trend > 0 ? "Improving (+" + trend.toFixed(1) + ")" : "Declining (" + trend.toFixed(1) + ")"}

YOUR 5 BEST OUTPUTS:
${top5.map(formatRun).join('\n')}

YOUR 3 WORST OUTPUTS:
${bottom3.map(formatRun).join('\n')}

YOUR CURRENT INSTRUCTIONS:
${(agent.systemPrompt || '').substring(0, 500)}

Analyze your performance honestly. Propose exactly 3 specific improvements.
Focus on what you can change about your approach, style, or instructions.

Respond ONLY with this JSON (no commentary, no markdown):
{
  "performanceSummary": "2-3 sentence honest assessment of your current performance",
  "proposedChanges": [
    {
      "changeType": "prompt|strategy|metric",
      "description": "Specific change to make",
      "reasoning": "Why this will improve performance based on the data"
    }
  ]
}`;

  // 5. Parse JSON response
  let reflectionData;
  try {
    const response = await generateText(prompt, 0.3);
    const cleanedJson = response.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    reflectionData = JSON.parse(cleanedJson);
  } catch (e) {
    console.error("Failed to generate reflection:", e);
    throw new HttpsError('internal', 'Failed to generate reflection.');
  }

  // 6. Save reflection to Firestore
  const reflectionId = uuidv4();
  const reflection = {
    reflectionId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    performanceSummary: reflectionData.performanceSummary || '',
    proposedChanges: reflectionData.proposedChanges || [],
    status: "pending",
    appliedAt: null
  };

  await agentRef.collection('reflections').doc(reflectionId).set(reflection);

  // 7. Create notification
  await db.collection('users').doc(uid).collection('notifications').add({
    type: "reflection_ready",
    agentId,
    agentName: agent.name,
    title: `${agent.name} has new improvement suggestions`,
    message: (reflection.performanceSummary || '').substring(0, 120) + '...',
    actionType: "navigate_learning",
    actionPayload: { agentId },
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {
    reflectionId,
    performanceSummary: reflection.performanceSummary,
    proposedChanges: reflection.proposedChanges
  };
}

module.exports = {
  agentSelfReflect
};
