import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase.js';
import { showLoading, hideLoading } from './components/loading.js';

const functions = getFunctions(app);

// Helper for retries and loading
async function callFunctionWithRetry(name, data = {}, retries = 1) {
  showLoading();
  try {
    const func = httpsCallable(functions, name);
    const result = await func(data);
    hideLoading();
    return result.data;
  } catch (error) {
    // Retry once on HTTP 500 error
    if (error.code === 'internal' && retries > 0) {
      console.warn(`Function ${name} failed with 500. Retrying in 1s...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      hideLoading(); // so outer call handles loading correctly
      return callFunctionWithRetry(name, data, retries - 1);
    }

    hideLoading();
    console.error(`Error calling function ${name}:`, error);
    if (window.toast) {
      window.toast(error.message || `Error calling ${name}`, 'error');
    }
    throw error;
  }
}

// ----------------------------------------------------
// EXPORTED API WRAPPERS
// ----------------------------------------------------

export async function runAgent(agentId, taskDescription, taskContext) {
  return callFunctionWithRetry('agentRun', { agentId, taskDescription, taskContext });
}

export async function scoreRun(agentId, runId, primaryScore, secondaryScores, humanRating, humanNote) {
  return callFunctionWithRetry('signalCollect', { agentId, runId, primaryScore, secondaryScores, humanRating, humanNote });
}

export async function evolveAgent(agentId) {
  return callFunctionWithRetry('promptEvolution', { agentId });
}

export async function reflectAgent(agentId) {
  return callFunctionWithRetry('agentSelfReflect', { agentId });
}

export async function applyReflection(agentId, reflectionId, approvedChangeIds) {
  return callFunctionWithRetry('applyReflection', { agentId, reflectionId, approvedChangeIds });
}

export async function newExperiment(params) {
  return callFunctionWithRetry('createExperiment', params);
}

export async function checkExperiment(experimentId) {
  return callFunctionWithRetry('checkExperimentSignificance', { experimentId });
}

export async function getExamples(agentId, limit) {
  return callFunctionWithRetry('getExamples', { agentId, limit });
}

export async function rollback(agentId, versionId) {
  return callFunctionWithRetry('rollbackAgent', { agentId, versionId });
}

export async function checkDrift(agentId) {
  return callFunctionWithRetry('checkDrift', { agentId });
}

export async function getUsage() {
  return callFunctionWithRetry('getUserUsage');
}

export async function makeCall(agentId, phoneNumber, prospectName, prospectCompany, context) {
  return callFunctionWithRetry('initiateCall', { agentId, phoneNumber, prospectName, prospectCompany, customContext: context });
}

// Keep legacy api object for backwards compatibility temporarily
export const api = {
  agentRun: (data) => callFunctionWithRetry('agentRun', data),
  signalCollect: (data) => callFunctionWithRetry('signalCollect', data),
  promptEvolution: (data) => callFunctionWithRetry('promptEvolution', data),
  agentSelfReflect: (data) => callFunctionWithRetry('agentSelfReflect', data),
  applyReflection: (data) => callFunctionWithRetry('applyReflection', data),
  createExperiment: (data) => callFunctionWithRetry('createExperiment', data),
  checkExperimentSignificance: (data) => callFunctionWithRetry('checkExperimentSignificance', data),
  shareInsight: (data) => callFunctionWithRetry('shareInsight', data),
  getTeamContext: (data) => callFunctionWithRetry('getTeamContext', data),
  checkDrift: (data) => callFunctionWithRetry('checkDrift', data),
  snapshotAgentVersion: (data) => callFunctionWithRetry('snapshotAgentVersion', data),
  rollbackAgent: (data) => callFunctionWithRetry('rollbackAgent', data),
  getExamples: (data) => callFunctionWithRetry('getExamples', data),
  deleteExample: (data) => callFunctionWithRetry('deleteExample', data),
  getUserUsage: (data) => callFunctionWithRetry('getUserUsage', data),
  initiateCall: (data) => callFunctionWithRetry('initiateCall', data)
};
