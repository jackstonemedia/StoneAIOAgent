const { db } = require('./lib/admin');
const { embedText } = require('./lib/gemini');
const { saveExample } = require('./lib/supabase');
const { HttpsError } = require('firebase-functions/v1/https');
const admin = require('firebase-admin');

async function collectSignal(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const uid = context.auth.uid;
  const { agentId, runId, primaryScore, secondaryScores = {}, humanRating = null, humanNote = "" } = data;

  if (!agentId || !runId || primaryScore === undefined) {
    throw new HttpsError('invalid-argument', 'agentId, runId, and primaryScore are required.');
  }

  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  const runRef = agentRef.collection('runs').doc(runId);

  // 1. Load the run document
  const runDoc = await runRef.get();
  if (!runDoc.exists) {
    throw new HttpsError('not-found', 'Run not found.');
  }
  const runData = runDoc.data();
  const strategyId = runData.strategyId;

  // 2. Compute weighted final score
  let weightedScore = primaryScore;
  if (humanRating !== null && humanRating >= 1 && humanRating <= 5) {
    weightedScore = (primaryScore * 0.4) + ((humanRating * 20) * 0.6);
  }
  weightedScore = Math.round(weightedScore * 10) / 10; // Round to 1 decimal place

  // 3. Update the run document
  await runRef.update({
    primaryScore,
    secondaryScores,
    humanRating,
    humanNote,
    weightedScore,
    scoredAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // 4. Update the strategy document
  if (strategyId) {
    const strategyRef = agentRef.collection('strategies').doc(strategyId);
    await db.runTransaction(async (transaction) => {
      const strategyDoc = await transaction.get(strategyRef);
      if (strategyDoc.exists) {
        const stratData = strategyDoc.data();
        const newRunCount = (stratData.runCount || 0) + 1;
        const newTotalScore = (stratData.totalScore || 0) + weightedScore;
        const newAverageScore = newTotalScore / newRunCount;
        
        let confidenceInterval = null;
        if (newRunCount >= 5) {
          confidenceInterval = 1.96 * (15 / Math.sqrt(newRunCount));
        }

        transaction.update(strategyRef, {
          runCount: newRunCount,
          totalScore: newTotalScore,
          averageScore: newAverageScore,
          lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
          confidenceInterval
        });
      }
    });
  }

  // 5. Update agent averageScore
  const recentScoredRunsSnapshot = await agentRef.collection('runs')
    .where('weightedScore', '!=', null)
    .orderBy('weightedScore') // Required by Firestore for inequality filter
    .orderBy('scoredAt', 'desc')
    .limit(50)
    .get();

  let totalWeighted = 0;
  let countWeighted = 0;
  let recentRuns = [];

  recentScoredRunsSnapshot.forEach(doc => {
    const d = doc.data();
    if (d.weightedScore !== undefined && d.weightedScore !== null) {
      totalWeighted += d.weightedScore;
      countWeighted++;
      recentRuns.push(d);
    }
  });

  // Sort recentRuns by scoredAt desc in memory since we had to order by weightedScore first
  recentRuns.sort((a, b) => {
    const timeA = a.scoredAt ? a.scoredAt.toMillis() : 0;
    const timeB = b.scoredAt ? b.scoredAt.toMillis() : 0;
    return timeB - timeA;
  });

  let agentAverageScore = 0;
  if (countWeighted > 0) {
    agentAverageScore = totalWeighted / countWeighted;
  }

  // 6. Check score variance (drift detection trigger)
  let suggestExperiment = false;
  const last20Runs = recentRuns.slice(0, 20);
  if (last20Runs.length > 1) {
    const mean20 = last20Runs.reduce((sum, r) => sum + r.weightedScore, 0) / last20Runs.length;
    const variance = last20Runs.reduce((sum, r) => sum + Math.pow(r.weightedScore - mean20, 2), 0) / (last20Runs.length - 1);
    const stdDev = Math.sqrt(variance);
    if (stdDev > 20) {
      suggestExperiment = true;
    }
  }

  await agentRef.update({
    averageScore: agentAverageScore,
    ...(suggestExperiment ? { suggestExperiment: true } : {})
  });

  // 7. Save to example library if score >= 80
  let savedToLibrary = false;
  if (weightedScore >= 80) {
    try {
      const embedding = await embedText(runData.outputSnapshot || "");
      await saveExample({
        userId: uid,
        agentId: agentId,
        runId: runId,
        taskDescription: runData.taskDescription || "",
        outputText: runData.outputSnapshot || "",
        strategyId: strategyId || "",
        primaryScore: weightedScore,
        embedding: embedding
      });
      await runRef.update({ savedToLibrary: true });
      savedToLibrary = true;
    } catch (err) {
      console.error("Failed to save example to Supabase:", err);
    }
  }

  // 8. If 5 consecutive runs all score below 40
  const last5Runs = recentRuns.slice(0, 5);
  if (last5Runs.length === 5 && last5Runs.every(r => r.weightedScore < 40)) {
    const agentDoc = await agentRef.get();
    const agentName = agentDoc.exists ? agentDoc.data().name : 'Agent';
    
    await db.collection('users').doc(uid).collection('notifications').add({
      type: "low_performance",
      agentId: agentId,
      agentName: agentName,
      title: `${agentName} is underperforming`,
      message: "5 consecutive runs scored below 40. Consider reviewing strategy or rolling back.",
      actionType: "navigate_agent",
      actionPayload: { agentId },
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  return {
    weightedScore,
    savedToLibrary,
    suggestExperiment
  };
}

module.exports = {
  collectSignal
};
