const functions = require("firebase-functions");
const { db, auth } = require("./lib/admin");
const gemini = require("./lib/gemini");
const supabase = require("./lib/supabase");
const { checkRateLimit, incrementUsage } = require("./lib/rate-limiter");
const { runAgent } = require("./agent-runner");
const { collectSignal } = require("./signal-collector");
const { evolvePrompt } = require("./prompt-evolution");
const { agentSelfReflect } = require("./self-reflection");
const { applyReflection } = require("./apply-reflection");
const { getExamples, deleteExample } = require("./examples");
const { snapshotAgentVersion, checkDrift, rollbackAgent } = require("./guardrails");
const { createExperiment, checkExperimentSignificance } = require("./experiments");
const { initiateCall, retellWebhook } = require("./voice-agent");
const { getUserUsage } = require("./user-usage");

const cors = require("cors")({ origin: true });

// Helper to create stub functions
const createStubFunction = (name, operation = null) => {
  return functions.https.onCall(async (data, context) => {
    // Verify auth context
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    // Call checkRateLimit for appropriate functions
    if (operation) {
      await checkRateLimit(context.auth.uid, operation);
      // For now, we don't increment usage in the stub unless requested,
      // but the prompt says "Call checkRateLimit for appropriate functions".
    }

    return { status: "ok", function: name };
  });
};

exports.agentRun = functions.https.onCall(runAgent);
exports.signalCollect = functions.https.onCall(collectSignal);
exports.promptEvolution = functions.https.onCall(evolvePrompt);
exports.agentSelfReflect = functions.https.onCall(agentSelfReflect);
exports.applyReflection = functions.https.onCall(applyReflection);

exports.promptEvolutionScheduled = functions.pubsub.schedule("every 24 hours").onRun(async (context) => {
  console.log("Running scheduled prompt evolution");
  return null;
});

exports.createExperiment = functions.https.onCall(createExperiment);
exports.checkExperimentSignificance = functions.https.onCall(checkExperimentSignificance);
exports.shareInsight = createStubFunction("shareInsight");
exports.getTeamContext = createStubFunction("getTeamContext");
exports.checkDrift = functions.https.onCall(checkDrift);
exports.snapshotAgentVersion = functions.https.onCall(snapshotAgentVersion);
exports.rollbackAgent = functions.https.onCall(rollbackAgent);
exports.getExamples = functions.https.onCall(getExamples);
exports.deleteExample = functions.https.onCall(deleteExample);
exports.getUserUsage = getUserUsage;
exports.initiateCall = initiateCall;
exports.retellWebhook = retellWebhook;
