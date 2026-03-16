import { db } from './firebase.js';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';

/**
 * Helper to generate unique IDs
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * Simple 30s In-Memory Cache
 */
const queryCache = new Map();

function getCached(key) {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.timestamp < 30000) {
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  queryCache.set(key, { timestamp: Date.now(), data });
}

function invalidateCache(prefix) {
  for (const key of queryCache.keys()) {
    if (key.startsWith(prefix)) queryCache.delete(key);
  }
}

// ============================================================================
// USERS
// ============================================================================

export async function getUser(uid) {
  const cacheKey = `user_${uid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const userRef = doc(db, 'users', uid);
    const snapshot = await getDoc(userRef);
    const data = snapshot.exists() ? snapshot.data() : null;
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Error in getUser:", error);
    throw error;
  }
}

export async function updateUser(uid, data) {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, data);
    invalidateCache(`user_${uid}`);
  } catch (error) {
    console.error("Error in updateUser:", error);
    throw error;
  }
}

// ============================================================================
// AGENTS
// ============================================================================

export async function createAgent(uid, data) {
  try {
    const agentId = generateId();
    const agentRef = doc(db, 'users', uid, 'agents', agentId);
    const payload = {
      agentId,
      ...data,
      createdAt: serverTimestamp()
    };
    await setDoc(agentRef, payload);
    invalidateCache(`listAgents_${uid}`);
    return payload;
  } catch (error) {
    console.error("Error in createAgent:", error);
    throw error;
  }
}

export async function getAgent(uid, agentId) {
  const cacheKey = `agent_${uid}_${agentId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const agentRef = doc(db, 'users', uid, 'agents', agentId);
    const snapshot = await getDoc(agentRef);
    const data = snapshot.exists() ? snapshot.data() : null;
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Error in getAgent:", error);
    throw error;
  }
}

export async function updateAgent(uid, agentId, data) {
  try {
    const agentRef = doc(db, 'users', uid, 'agents', agentId);
    await updateDoc(agentRef, data);
    invalidateCache(`agent_${uid}_${agentId}`);
    invalidateCache(`listAgents_${uid}`);
  } catch (error) {
    console.error("Error in updateAgent:", error);
    throw error;
  }
}

export async function listAgents(uid) {
  const cacheKey = `listAgents_${uid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const agentsRef = collection(db, 'users', uid, 'agents');
    const q = query(agentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => doc.data());
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Error in listAgents:", error);
    throw error;
  }
}

export async function deleteAgent(uid, agentId) {
  try {
    const agentRef = doc(db, 'users', uid, 'agents', agentId);
    await deleteDoc(agentRef);
  } catch (error) {
    console.error("Error in deleteAgent:", error);
    throw error;
  }
}

// ============================================================================
// STRATEGIES
// ============================================================================

export async function createStrategy(uid, agentId, data) {
  try {
    const strategyId = generateId();
    const strategyRef = doc(db, 'users', uid, 'agents', agentId, 'strategies', strategyId);
    const payload = {
      strategyId,
      ...data,
      createdAt: serverTimestamp()
    };
    await setDoc(strategyRef, payload);
    return payload;
  } catch (error) {
    console.error("Error in createStrategy:", error);
    throw error;
  }
}

export async function getStrategy(uid, agentId, strategyId) {
  try {
    const strategyRef = doc(db, 'users', uid, 'agents', agentId, 'strategies', strategyId);
    const snapshot = await getDoc(strategyRef);
    return snapshot.exists() ? snapshot.data() : null;
  } catch (error) {
    console.error("Error in getStrategy:", error);
    throw error;
  }
}

export async function updateStrategy(uid, agentId, strategyId, data) {
  try {
    const strategyRef = doc(db, 'users', uid, 'agents', agentId, 'strategies', strategyId);
    await updateDoc(strategyRef, data);
  } catch (error) {
    console.error("Error in updateStrategy:", error);
    throw error;
  }
}

export async function listStrategies(uid, agentId) {
  const cacheKey = `listStrategies_${uid}_${agentId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const strategiesRef = collection(db, 'users', uid, 'agents', agentId, 'strategies');
    const q = query(strategiesRef, orderBy('averageScore', 'desc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => doc.data());
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Error in listStrategies:", error);
    throw error;
  }
}

// ============================================================================
// RUNS
// ============================================================================

export async function createRun(uid, agentId, data) {
  try {
    const runId = generateId();
    const runRef = doc(db, 'users', uid, 'agents', agentId, 'runs', runId);
    const payload = {
      runId,
      ...data,
      createdAt: serverTimestamp()
    };
    await setDoc(runRef, payload);
    return payload;
  } catch (error) {
    console.error("Error in createRun:", error);
    throw error;
  }
}

export async function updateRun(uid, agentId, runId, data) {
  try {
    const runRef = doc(db, 'users', uid, 'agents', agentId, 'runs', runId);
    await updateDoc(runRef, data);
  } catch (error) {
    console.error("Error in updateRun:", error);
    throw error;
  }
}

export async function listRuns(uid, agentId, limitCount = 50) {
  const cacheKey = `listRuns_${uid}_${agentId}_${limitCount}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const runsRef = collection(db, 'users', uid, 'agents', agentId, 'runs');
    const q = query(runsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => doc.data());
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Error in listRuns:", error);
    throw error;
  }
}

// ============================================================================
// REFLECTIONS
// ============================================================================

export async function createReflection(uid, agentId, data) {
  try {
    const reflectionId = generateId();
    const reflectionRef = doc(db, 'users', uid, 'agents', agentId, 'reflections', reflectionId);
    const payload = {
      reflectionId,
      ...data,
      createdAt: serverTimestamp()
    };
    await setDoc(reflectionRef, payload);
    return payload;
  } catch (error) {
    console.error("Error in createReflection:", error);
    throw error;
  }
}

export async function updateReflection(uid, agentId, reflectionId, data) {
  try {
    const reflectionRef = doc(db, 'users', uid, 'agents', agentId, 'reflections', reflectionId);
    await updateDoc(reflectionRef, data);
  } catch (error) {
    console.error("Error in updateReflection:", error);
    throw error;
  }
}

export async function listPendingReflections(uid, agentId) {
  try {
    const reflectionsRef = collection(db, 'users', uid, 'agents', agentId, 'reflections');
    const q = query(reflectionsRef, where('status', '==', 'pending'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Error in listPendingReflections:", error);
    throw error;
  }
}

// ============================================================================
// EXPERIMENTS
// ============================================================================

export async function createExperiment(uid, data) {
  try {
    const experimentId = generateId();
    const experimentRef = doc(db, 'users', uid, 'experiments', experimentId);
    const payload = {
      experimentId,
      ...data,
      createdAt: serverTimestamp()
    };
    await setDoc(experimentRef, payload);
    return payload;
  } catch (error) {
    console.error("Error in createExperiment:", error);
    throw error;
  }
}

export async function updateExperiment(uid, experimentId, data) {
  try {
    const experimentRef = doc(db, 'users', uid, 'experiments', experimentId);
    await updateDoc(experimentRef, data);
  } catch (error) {
    console.error("Error in updateExperiment:", error);
    throw error;
  }
}

export async function listExperiments(uid) {
  try {
    const experimentsRef = collection(db, 'users', uid, 'experiments');
    const q = query(experimentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Error in listExperiments:", error);
    throw error;
  }
}

// ============================================================================
// TEAM MEMORY
// ============================================================================

export async function createTeamMemory(uid, data) {
  try {
    const memoryId = generateId();
    const memoryRef = doc(db, 'users', uid, 'teamMemory', memoryId);
    const payload = {
      memoryId,
      ...data,
      createdAt: serverTimestamp()
    };
    await setDoc(memoryRef, payload);
    return payload;
  } catch (error) {
    console.error("Error in createTeamMemory:", error);
    throw error;
  }
}

export async function listTeamMemory(uid, agentType) {
  try {
    const memoryRef = collection(db, 'users', uid, 'teamMemory');
    let q = memoryRef;
    if (agentType) {
      q = query(memoryRef, where('applicableAgentTypes', 'array-contains', agentType));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Error in listTeamMemory:", error);
    throw error;
  }
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export async function createNotification(uid, data) {
  try {
    const notifId = generateId();
    const notifRef = doc(db, 'users', uid, 'notifications', notifId);
    const payload = {
      notifId,
      ...data,
      createdAt: serverTimestamp()
    };
    await setDoc(notifRef, payload);
    return payload;
  } catch (error) {
    console.error("Error in createNotification:", error);
    throw error;
  }
}

export async function markNotificationRead(uid, notifId) {
  try {
    const notifRef = doc(db, 'users', uid, 'notifications', notifId);
    await updateDoc(notifRef, { read: true });
  } catch (error) {
    console.error("Error in markNotificationRead:", error);
    throw error;
  }
}

export async function listUnreadNotifications(uid) {
  try {
    const notifRef = collection(db, 'users', uid, 'notifications');
    const q = query(notifRef, where('read', '==', false));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Error in listUnreadNotifications:", error);
    throw error;
  }
}
