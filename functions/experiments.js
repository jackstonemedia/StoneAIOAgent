const functions = require("firebase-functions");
const { db } = require("./lib/admin");
const crypto = require("crypto");
const { checkRateLimit } = require("./lib/rate-limiter");

exports.createExperiment = async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const { agentId, name, hypothesis, variantADescription, variantBDescription, variantAPromptSnippet, variantBPromptSnippet, targetRunsPerVariant } = data;

  if (!agentId || !name || !hypothesis || !variantADescription || !variantBDescription || !variantAPromptSnippet || !variantBPromptSnippet || !targetRunsPerVariant) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
  }

  await checkRateLimit(uid, "createExperiment");

  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  const agentDoc = await agentRef.get();
  if (!agentDoc.exists) throw new functions.https.HttpsError('not-found', 'Agent not found.');
  const agent = agentDoc.data();

  const experimentId = crypto.randomUUID();
  const stratAId = crypto.randomUUID();
  const stratBId = crypto.randomUUID();

  const batch = db.batch();

  // Create Strategy A
  const stratARef = agentRef.collection('strategies').doc(stratAId);
  batch.set(stratARef, {
    name: name + " — Variant A",
    description: variantADescription,
    configurationSnapshot: agent.systemPrompt + "\n\n## Experiment Variant A\n" + variantAPromptSnippet,
    status: "testing",
    source: "experiment",
    runCount: 0,
    averageScore: 50,
    createdAt: new Date()
  });

  // Create Strategy B
  const stratBRef = agentRef.collection('strategies').doc(stratBId);
  batch.set(stratBRef, {
    name: name + " — Variant B",
    description: variantBDescription,
    configurationSnapshot: agent.systemPrompt + "\n\n## Experiment Variant B\n" + variantBPromptSnippet,
    status: "testing",
    source: "experiment",
    runCount: 0,
    averageScore: 50,
    createdAt: new Date()
  });

  // Create Experiment
  const expRef = db.collection('users').doc(uid).collection('experiments').doc(experimentId);
  batch.set(expRef, {
    experimentId,
    agentId,
    agentName: agent.name || 'Unknown Agent',
    name,
    hypothesis,
    variantA: { strategyId: stratAId, description: variantADescription },
    variantB: { strategyId: stratBId, description: variantBDescription },
    status: "active",
    targetRunsPerVariant,
    currentRunsA: 0,
    currentRunsB: 0,
    scoresA: [],
    scoresB: [],
    winnerId: null,
    tStat: null,
    createdAt: new Date(),
    completedAt: null
  });

  await batch.commit();

  return { experimentId, strategyIdA: stratAId, strategyIdB: stratBId };
};

exports.checkExperimentSignificance = async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  const uid = context.auth.uid;
  const { experimentId } = data;

  if (!experimentId) throw new functions.https.HttpsError('invalid-argument', 'experimentId is required.');

  await checkRateLimit(uid, "checkExperimentSignificance");

  const expRef = db.collection('users').doc(uid).collection('experiments').doc(experimentId);
  const expDoc = await expRef.get();
  if (!expDoc.exists) throw new functions.https.HttpsError('not-found', 'Experiment not found.');
  const exp = expDoc.data();

  const agentRef = db.collection('users').doc(uid).collection('agents').doc(exp.agentId);
  const runsSnap = await agentRef.collection('runs').get();
  const runs = runsSnap.docs.map(d => d.data());

  const scoresA = runs.filter(r => r.strategyId === exp.variantA.strategyId && r.primaryScore != null).map(r => r.weightedScore || r.primaryScore);
  const scoresB = runs.filter(r => r.strategyId === exp.variantB.strategyId && r.primaryScore != null).map(r => r.weightedScore || r.primaryScore);

  const n1 = scoresA.length;
  const n2 = scoresB.length;

  if (n1 === 0 || n2 === 0) {
    return { significant: false, n1, n2 };
  }

  const mean1 = scoresA.reduce((a, b) => a + b, 0) / n1;
  const mean2 = scoresB.reduce((a, b) => a + b, 0) / n2;

  let var1 = 0;
  if (n1 > 1) {
    var1 = scoresA.reduce((a, b) => a + Math.pow(b - mean1, 2), 0) / (n1 - 1);
  }

  let var2 = 0;
  if (n2 > 1) {
    var2 = scoresB.reduce((a, b) => a + Math.pow(b - mean2, 2), 0) / (n2 - 1);
  }

  const pooledSE = Math.sqrt(var1 / n1 + var2 / n2);
  const tStat = pooledSE === 0 ? 0 : (mean1 - mean2) / pooledSE;

  const significant = Math.abs(tStat) > 2.0 && n1 >= exp.targetRunsPerVariant && n2 >= exp.targetRunsPerVariant;

  let winnerId = null;
  if (significant) {
    winnerId = mean1 > mean2 ? "A" : "B";
    const winningStrategyId = winnerId === "A" ? exp.variantA.strategyId : exp.variantB.strategyId;

    const batch = db.batch();
    batch.update(expRef, {
      status: "completed",
      winnerId,
      tStat,
      completedAt: new Date(),
      currentRunsA: n1,
      currentRunsB: n2,
      scoresA,
      scoresB
    });

    // Give winning strategy a +15 score bonus
    const stratRef = agentRef.collection('strategies').doc(winningStrategyId);
    const stratDoc = await stratRef.get();
    if (stratDoc.exists) {
      const strat = stratDoc.data();
      batch.update(stratRef, {
        averageScore: (strat.averageScore || 50) + 15
      });
    }

    // Create notification
    const notifRef = db.collection('users').doc(uid).collection('notifications').doc();
    batch.set(notifRef, {
      type: 'experiment_complete',
      title: 'Experiment Completed',
      message: `Experiment "${exp.name}" has concluded. Variant ${winnerId} is the winner.`,
      agentId: exp.agentId,
      read: false,
      createdAt: new Date()
    });

    await batch.commit();
  } else {
    // Just update counts
    await expRef.update({
      currentRunsA: n1,
      currentRunsB: n2,
      scoresA,
      scoresB
    });
  }

  return { significant, winnerId, meanA: mean1, meanB: mean2, tStat, n1, n2 };
};
