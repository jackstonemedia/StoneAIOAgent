const functions = require("firebase-functions");
const { getTopExamples, deleteExample } = require("./lib/supabase");
const { checkRateLimit } = require("./lib/rate-limiter");

exports.getExamples = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  }
  
  const uid = context.auth.uid;
  const { agentId, limit = 20 } = data;
  
  if (!agentId) {
    throw new functions.https.HttpsError('invalid-argument', 'agentId is required.');
  }
  
  await checkRateLimit(uid, "getExamples");
  
  try {
    const examples = await getTopExamples(agentId, limit);
    return { examples };
  } catch (error) {
    console.error("Error fetching examples:", error);
    // Return empty array if Supabase is not configured or fails
    return { examples: [] };
  }
};

exports.deleteExample = async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
  }
  
  const uid = context.auth.uid;
  const { exampleId } = data;
  
  if (!exampleId) {
    throw new functions.https.HttpsError('invalid-argument', 'exampleId is required.');
  }
  
  await checkRateLimit(uid, "deleteExample");
  
  try {
    await deleteExample(exampleId);
    return { success: true };
  } catch (error) {
    console.error("Error deleting example:", error);
    throw new functions.https.HttpsError('internal', 'Failed to delete example.');
  }
};
