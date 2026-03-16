const { db } = require('./lib/admin');
const { checkRateLimit, incrementUsage } = require('./lib/rate-limiter');
const { embedText, generateText, cosineSimilarity } = require('./lib/gemini');
const { getTopExamples } = require('./lib/supabase');
const { HttpsError } = require('firebase-functions/v1/https');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

async function snapshotAgentVersion(uid, agentId, agentData) {
  const snapshotId = uuidv4();
  await db.collection('users').doc(uid).collection('agents').doc(agentId)
    .collection('versions').doc(snapshotId).set({
      versionId: snapshotId,
      systemPrompt: agentData.systemPrompt || '',
      baseSystemPrompt: agentData.baseSystemPrompt || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

async function runEvolution(uid, agentId) {
  // Step 1 - Rate limit + snapshot
  await checkRateLimit(uid, "promptEvolution");
  
  const agentRef = db.collection('users').doc(uid).collection('agents').doc(agentId);
  const agentDoc = await agentRef.get();
  if (!agentDoc.exists) {
    throw new Error('Agent not found.');
  }
  const agent = agentDoc.data();
  
  await snapshotAgentVersion(uid, agentId, agent);

  // Step 2 - Load data
  const strategiesSnapshot = await agentRef.collection('strategies').get();
  const strategies = [];
  strategiesSnapshot.forEach(doc => strategies.push({ id: doc.id, ...doc.data() }));

  const runsSnapshot = await agentRef.collection('runs')
    .where('primaryScore', '!=', null)
    .orderBy('primaryScore') // Firestore requires ordering by the inequality field first
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
    
  let runs = [];
  runsSnapshot.forEach(doc => runs.push(doc.data()));
  // Re-sort by createdAt desc in memory
  runs.sort((a, b) => {
    const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });

  // Step 3 - Strategy promotion/demotion
  const batch = db.batch();
  for (const strat of strategies) {
    let changed = false;
    let newStatus = strat.status;
    if ((strat.averageScore || 0) >= 70 && (strat.runCount || 0) >= 5) {
      newStatus = "active";
    } else if ((strat.averageScore || 0) < 40 && (strat.runCount || 0) >= 20) {
      newStatus = "archived";
    }
    if (newStatus !== strat.status) {
      batch.update(agentRef.collection('strategies').doc(strat.id), { status: newStatus });
    }
  }
  await batch.commit();

  // Step 4 - Pattern extraction
  // Sort runs by weightedScore to get top 15 and bottom 5
  const sortedByScore = [...runs].sort((a, b) => (b.weightedScore || b.primaryScore || 0) - (a.weightedScore || a.primaryScore || 0));
  const topRuns = sortedByScore.slice(0, 15);
  const bottomRuns = sortedByScore.slice(-5);

  const formatRun = (r) => `Score ${r.weightedScore || r.primaryScore || 0}\nTask: ${r.taskDescription || ''}\nOutput: ${(r.outputSnapshot || '').substring(0, 200)}\n---`;

  const patternPrompt = `You are analyzing an AI agent called "${agent.name}" that ${agent.role || 'performs tasks'}.
Its primary success metric is ${agent.primaryMetric || 'success'}.

HIGH-PERFORMING OUTPUTS (score 80+):
${topRuns.map(formatRun).join('\n')}

LOW-PERFORMING OUTPUTS (score below 50):
${bottomRuns.map(formatRun).join('\n')}

Identify exactly 3 specific, actionable patterns that explain why high-performing outputs succeed. Be concrete — not "be more engaging" but specific observations like "Emails under 80 words have 40% higher reply rates".

Respond ONLY with a JSON array, no commentary, no markdown:
[{"pattern":"...","evidence":"...","recommendation":"..."}]`;

  let patterns = [];
  try {
    const patternResponse = await generateText(patternPrompt, 0.2);
    const cleanedJson = patternResponse.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    patterns = JSON.parse(cleanedJson);
  } catch (e) {
    console.error("Failed to extract patterns:", e);
    patterns = [];
  }

  if (patterns.length > 0) {
    await agentRef.update({ extractedPatterns: patterns });
  }

  // Step 5 - Rewrite system prompt
  const rewritePrompt = `You are updating the system prompt for an AI agent.

ORIGINAL BASE PROMPT (the core role — preserve this intent):
${agent.baseSystemPrompt || ''}

CURRENT SYSTEM PROMPT:
${agent.systemPrompt || ''}

NEWLY DISCOVERED PERFORMANCE PATTERNS:
${patterns.map((p, i) => `${i+1}. ${p.pattern} - ${p.recommendation}`).join('\n')}

Rewrite the system prompt to incorporate these patterns as explicit instructions. Keep the same core role and goal. Add a section called "## Learned Best Practices" at the end with specific dos and don'ts derived from the patterns. Return ONLY the new system prompt text. No commentary.`;

  let proposedPrompt = agent.systemPrompt;
  try {
    proposedPrompt = await generateText(rewritePrompt, 0.4);
  } catch (e) {
    console.error("Failed to rewrite prompt:", e);
  }

  // Step 6 - Semantic change detection
  let similarity = 1;
  let needsApproval = false;
  let promptChanged = false;
  
  if (proposedPrompt && proposedPrompt !== agent.systemPrompt) {
    try {
      const vecOld = await embedText(agent.systemPrompt || '');
      const vecNew = await embedText(proposedPrompt);
      similarity = cosineSimilarity(vecOld, vecNew);
      promptChanged = true;
      
      if (similarity < 0.85) {
        needsApproval = true;
        await agentRef.update({ proposedSystemPrompt: proposedPrompt, needsPromptApproval: true });
        await db.collection('users').doc(uid).collection('notifications').add({
          type: "evolution_needs_approval",
          agentId,
          agentName: agent.name,
          title: `${agent.name} has a new proposed prompt`,
          message: "The prompt evolution engine has proposed a significant change to the system prompt. Please review and approve.",
          actionType: "navigate_agent",
          actionPayload: { agentId },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await agentRef.update({ systemPrompt: proposedPrompt, proposedSystemPrompt: null });
        await db.collection('users').doc(uid).collection('notifications').add({
          type: "evolution_applied",
          agentId,
          agentName: agent.name,
          title: `${agent.name} prompt updated`,
          message: "The prompt evolution engine has automatically applied minor improvements to the system prompt.",
          actionType: "navigate_agent",
          actionPayload: { agentId },
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (e) {
      console.error("Failed to compare prompts:", e);
    }
  }

  // Step 7 - Pin top examples
  try {
    const topExamples = await getTopExamples(agentId, 10);
    const pinnedExampleIds = topExamples.slice(0, 5).map(ex => ex.id);
    await agentRef.update({ pinnedExampleIds });
  } catch (e) {
    console.error("Failed to pin examples:", e);
  }

  // Step 8 - Share insights to team memory
  const memoryBatch = db.batch();
  for (const pattern of patterns) {
    const memRef = db.collection('users').doc(uid).collection('teamMemory').doc();
    memoryBatch.set(memRef, {
      sourceAgentId: agentId,
      sourceAgentName: agent.name,
      insight: pattern.pattern + " — " + pattern.recommendation,
      category: "learned_pattern",
      supportingScore: 80,
      applicableAgentTypes: [agent.type],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  await memoryBatch.commit();

  // Step 9 - Finalize
  await agentRef.update({
    lastEvolutionAt: admin.firestore.FieldValue.serverTimestamp(),
    evolutionCount: admin.firestore.FieldValue.increment(1)
  });
  
  await incrementUsage(uid, "promptEvolution");

  return { patternsFound: patterns.length, promptChanged, needsApproval, similarity };
}

async function evolvePrompt(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const { agentId } = data;
  if (!agentId) throw new HttpsError('invalid-argument', 'agentId is required');
  
  try {
    return await runEvolution(context.auth.uid, agentId);
  } catch (e) {
    console.error("Evolution failed:", e);
    throw new HttpsError('internal', e.message);
  }
}

module.exports = {
  evolvePrompt,
  runEvolution
};
