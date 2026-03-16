const { db } = require('./admin');
const { HttpsError } = require('firebase-functions/v1/https');

async function checkRateLimit(uid, operation) {
  const userRef = db.collection('users').doc(uid);
  
  return await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User not found');
    }
    
    const data = userDoc.data();
    const today = new Date().toISOString().split('T')[0];
    
    let agentRunsToday = data.agentRunsToday || 0;
    let evolutionsToday = data.evolutionsToday || 0;
    let selfReflectsToday = data.selfReflectsToday || 0;
    
    // Reset counters if it's a new day
    if (data.lastResetDate !== today) {
      agentRunsToday = 0;
      evolutionsToday = 0;
      selfReflectsToday = 0;
      
      transaction.update(userRef, {
        lastResetDate: today,
        agentRunsToday: 0,
        evolutionsToday: 0,
        selfReflectsToday: 0
      });
    }
    
    let allowed = true;
    let limit = 0;
    
    switch (operation) {
      case 'agentRun':
        limit = 50;
        if (agentRunsToday >= limit) allowed = false;
        break;
      case 'promptEvolution':
        limit = 5;
        if (evolutionsToday >= limit) allowed = false;
        break;
      case 'selfReflect':
        limit = 10;
        if (selfReflectsToday >= limit) allowed = false;
        break;
      default:
        // Unknown operation, allow by default
        break;
    }
    
    if (!allowed) {
      throw new HttpsError('resource-exhausted', `Daily limit reached for ${operation}`);
    }
    
    return { allowed: true };
  });
}

async function incrementUsage(uid, operation) {
  const userRef = db.collection('users').doc(uid);
  const admin = require('firebase-admin');
  
  const updates = {};
  switch (operation) {
    case 'agentRun':
      updates.agentRunsToday = admin.firestore.FieldValue.increment(1);
      updates.totalRuns = admin.firestore.FieldValue.increment(1);
      break;
    case 'promptEvolution':
      updates.evolutionsToday = admin.firestore.FieldValue.increment(1);
      break;
    case 'selfReflect':
      updates.selfReflectsToday = admin.firestore.FieldValue.increment(1);
      break;
  }
  
  if (Object.keys(updates).length > 0) {
    await userRef.update(updates);
  }
}

module.exports = {
  checkRateLimit,
  incrementUsage
};
