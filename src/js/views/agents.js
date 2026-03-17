import { getCurrentUser } from '../app.js';
import { listAgents, createAgent, createStrategy, deleteAgent, listRuns, listStrategies, updateAgent } from '../db-helpers.js';
import { renderRunScorer, init as initRunScorer } from '../components/run-scorer.js';
import { renderLearningView } from './learning-view.js';
import { renderVersionHistory } from '../components/version-history.js';
import { makeCall } from '../api.js';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

let currentAgents = [];
let selectedAgentId = null;
let currentStep = 1;

const agentTypes = [
  { id: 'email', name: 'Email Agent', desc: 'Writes and sends emails, learns from open/reply rates', badge: 'badge-purple' },
  { id: 'content', name: 'Content Agent', desc: 'Creates content, learns from engagement and conversions', badge: 'badge-blue' },
  { id: 'voice', name: 'Voice/SDR Agent', desc: 'Makes phone calls via Retell.ai, learns from bookings', badge: 'badge-coral' },
  { id: 'browser', name: 'Browser Agent', desc: 'Navigates the web autonomously using Playwright', badge: 'badge-teal' },
  { id: 'autonomous', name: 'Autonomous Agent', desc: 'Receives goals, plans and executes multi-step tasks', badge: 'badge-amber' },
  { id: 'workflow', name: 'Workflow Agent', desc: 'Follows a defined sequence of steps deterministically', badge: 'badge-gray' }
];

const typeMetrics = {
  'email': ['Reply Rate', 'Open Rate', 'Click Rate', 'Unsubscribe Rate'],
  'content': ['Engagement Time', 'Share Rate', 'Conversion Rate'],
  'voice': ['Meeting Booked', 'Call Duration', 'Sentiment Score'],
  'browser': ['Task Completion', 'Human Rating Average'],
  'autonomous': ['Task Completion', 'Human Rating Average'],
  'workflow': ['Task Completion', 'Human Rating Average']
};

const defaultPrompts = {
  'email': 'You are an expert email marketer. Your goal is to write highly converting outbound emails. Keep them concise, personalized, and focused on a single call to action.',
  'content': 'You are a master copywriter. Create engaging, high-quality content tailored to the target audience. Focus on readability, emotional connection, and clear value.',
  'voice': 'You are a professional SDR. Your objective is to qualify leads and book meetings. Be conversational, handle objections gracefully, and always push for a calendar invite.',
  'browser': 'You are an autonomous web navigation agent. Given a goal, you will plan steps, interact with DOM elements, and extract required information efficiently.',
  'autonomous': 'You are a general-purpose autonomous agent. Break down complex goals into manageable tasks, execute them sequentially, and verify results before proceeding.',
  'workflow': 'You are a deterministic workflow executor. Follow the provided steps exactly as defined without deviation. Report success or failure at each node.'
};

let builderData = {
  type: '',
  name: '',
  role: '',
  primaryMetric: '',
  baseSystemPrompt: '',
  learningEnabled: true,
  exploitRatio: 0.8,
  reflectionFrequency: 'Weekly'
};

export async function render() {
  return `
    <div id="agents-view-container">
      <!-- List View -->
      <div id="agents-list-view">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="margin: 0;">My Agents</h2>
          <button class="btn btn-primary" onclick="window.agentsView.openBuilder('create')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            New Agent
          </button>
        </div>
        <div id="agents-grid-container">
          <div class="loading-spinner">Loading agents...</div>
        </div>
      </div>

      <!-- Detail View -->
      <div id="agent-detail-view" style="display: none;">
        <div class="detail-header">
          <button class="btn btn-ghost" onclick="window.agentsView.closeDetail()" style="padding: 0.5rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <h2 id="detail-agent-name" style="margin: 0;">Agent Name</h2>
          <span id="detail-agent-badge" class="badge">Type</span>
        </div>

        <div class="detail-tabs">
          <div class="detail-tab active" onclick="window.agentsView.switchTab('overview')">Overview</div>
          <div class="detail-tab" onclick="window.agentsView.switchTab('runs')">Runs</div>
          <div class="detail-tab" onclick="window.agentsView.switchTab('learning')">Learning</div>
          <div class="detail-tab" onclick="window.agentsView.switchTab('versions')">Version History</div>
        </div>

        <div id="tab-overview" class="tab-content active">
          <div id="drift-alert-container"></div>
          <div class="card" style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
              <h3>System Prompt</h3>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-secondary btn-sm" onclick="window.agentsView.openBuilder('edit')">Edit</button>
                <button class="btn btn-primary btn-sm" id="btn-run-agent" onclick="window.agentsView.openRunModal('${selectedAgentId}')">Run Now</button>
              </div>
            </div>
            <pre id="detail-system-prompt" style="background: rgba(0,0,0,0.03); padding: 1rem; border-radius: 0.5rem; white-space: pre-wrap; color: var(--text-secondary); font-family: var(--font-mono); font-size: 0.875rem; border: 1px solid var(--border-color);"></pre>
          </div>

          <!-- Run Agent Panel (Hidden by default) -->
          <div id="run-agent-panel" class="card" style="margin-bottom: 1.5rem; display: none; border-color: var(--accent-purple);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="margin: 0;">Initiate Interaction</h3>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('run-agent-panel').style.display='none'">Close</button>
            </div>
            
            <div id="run-voice-form" style="display: none;">
              <div class="form-group">
                <label>Prospect Phone Number *</label>
                <input type="text" id="run-voice-phone" class="form-control" placeholder="+1234567890">
              </div>
              <div style="display: flex; gap: 1rem;">
                <div class="form-group" style="flex: 1;">
                  <label>Prospect Name</label>
                  <input type="text" id="run-voice-name" class="form-control" placeholder="John Doe">
                </div>
                <div class="form-group" style="flex: 1;">
                  <label>Company Name</label>
                  <input type="text" id="run-voice-company" class="form-control" placeholder="Acme Corp">
                </div>
              </div>
              <div class="form-group">
                <label>Custom Context / Notes</label>
                <textarea id="run-voice-context" class="form-control" rows="2" placeholder="He visited our pricing page recently..."></textarea>
              </div>
              <button class="btn btn-primary" id="btn-submit-call" onclick="window.agentsView.submitVoiceCall()" style="width: 100%;">Initiate Call</button>
            </div>
            
            <div id="run-general-form" style="display: none;">
              <div class="form-group">
                <label>Task Description *</label>
                <input type="text" id="run-general-task" class="form-control" placeholder="What should the agent do?">
              </div>
              <div class="form-group">
                <label>Context</label>
                <textarea id="run-general-context" class="form-control" rows="3" placeholder="Additional details or data needed to execute the task..."></textarea>
              </div>
              <button class="btn btn-primary" id="btn-submit-general" onclick="window.agentsView.submitGeneralRun()" style="width: 100%;">Execute Run</button>
            </div>

            <div id="run-active-state" style="display: none; padding: 1rem; text-align: center;">
              <div class="loading-spinner" style="margin-bottom: 1rem;">Processing...</div>
              <h4 id="run-status-text">Generating script and initiating call...</h4>
              <div id="run-script-preview" style="margin-top: 1rem; background: rgba(0,0,0,0.03); padding: 1rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; color: var(--text-secondary); text-align: left; white-space: pre-wrap; display: none; border: 1px solid var(--border-color);"></div>
            </div>
          </div>

          <div class="agents-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-top: 0;">
            <div class="card">
              <div class="text-secondary" style="font-size: 0.875rem; margin-bottom: 0.5rem;">Primary Metric</div>
              <div id="detail-metric" style="font-size: 1.25rem; font-weight: 600;">-</div>
            </div>
            <div class="card">
              <div class="text-secondary" style="font-size: 0.875rem; margin-bottom: 0.5rem;">Total Runs</div>
              <div id="detail-runs" style="font-size: 1.25rem; font-weight: 600;">0</div>
            </div>
            <div class="card">
              <div class="text-secondary" style="font-size: 0.875rem; margin-bottom: 0.5rem;">Average Score</div>
              <div id="detail-score" style="font-size: 1.25rem; font-weight: 600;">0.0</div>
            </div>
          </div>
        </div>

        <div id="tab-runs" class="tab-content">
          <div class="card">
            <div style="overflow-x: auto;">
              <table class="run-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Strategy</th>
                    <th>Score</th>
                    <th>Duration</th>
                    <th>Output Snippet</th>
                  </tr>
                </thead>
                <tbody id="detail-runs-body">
                  <tr><td colspan="5" style="text-align: center; padding: 2rem;">Loading runs...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div id="tab-learning" class="tab-content">
          <div class="card" id="learning-container">
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading learning data...</div>
          </div>
        </div>

        <div id="tab-versions" class="tab-content">
          <div class="card" id="versions-container">
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading versions...</div>
          </div>
        </div>
      </div>

      <!-- Slide-in Builder Panel Overlay -->
      <div id="builder-overlay" class="slide-panel-overlay" onclick="window.agentsView.closeBuilder()"></div>
      
      <!-- Slide-in Builder Panel -->
      <div id="builder-panel" class="slide-panel">
        <div class="slide-panel-header">
          <h3 id="builder-title" style="margin: 0;">Create New Agent</h3>
          <button class="btn btn-ghost" onclick="window.agentsView.closeBuilder()" style="padding: 0.5rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div class="slide-panel-content">
          <div class="wizard-progress">
            <div class="wizard-dot active" id="dot-1"></div>
            <div class="wizard-dot" id="dot-2"></div>
            <div class="wizard-dot" id="dot-3"></div>
            <div class="wizard-dot" id="dot-4"></div>
          </div>

          <!-- Step 1: Type -->
          <div id="step-1" class="wizard-step active">
            <h4 style="margin-bottom: 1.5rem;">Choose Agent Type</h4>
            <div class="type-grid" id="type-grid-container">
              ${agentTypes.map(t => `
                <div class="type-card" id="type-card-${t.id}" onclick="window.agentsView.selectType('${t.id}')">
                  <h4>${t.name}</h4>
                  <p>${t.desc}</p>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Step 2: Identity -->
          <div id="step-2" class="wizard-step">
            <h4 style="margin-bottom: 1.5rem;">Agent Identity</h4>
            <div class="form-group">
              <label>Agent Name *</label>
              <input type="text" id="b-name" class="form-control" placeholder="e.g., Outbound Sales Pro" oninput="window.agentsView.updateBuilderData('name', this.value)">
            </div>
            <div class="form-group">
              <label>Role Description</label>
              <textarea id="b-role" class="form-control" placeholder="Describe the agent's persona and context..." oninput="window.agentsView.updateBuilderData('role', this.value)"></textarea>
            </div>
            <div class="form-group">
              <label>Primary Metric</label>
              <select id="b-metric" class="form-control" onchange="window.agentsView.updateBuilderData('primaryMetric', this.value)">
                <!-- Populated dynamically -->
              </select>
            </div>
          </div>

          <!-- Step 3: Instructions -->
          <div id="step-3" class="wizard-step">
            <h4 style="margin-bottom: 1.5rem;">Instructions & Learning</h4>
            <div class="form-group">
              <label>Base System Prompt *</label>
              <textarea id="b-prompt" class="form-control" style="min-height: 150px;" oninput="window.agentsView.updateBuilderData('baseSystemPrompt', this.value)"></textarea>
            </div>
            <div class="form-group" style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--border-color);">
              <div>
                <label style="margin-bottom: 0.25rem;">Enable Continuous Learning</label>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Agent will reflect and propose prompt improvements.</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="b-learning" checked onchange="window.agentsView.updateBuilderData('learningEnabled', this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="form-group">
              <label>Exploit vs. Explore Ratio: <span id="b-ratio-val">0.8</span></label>
              <div class="slider-container">
                <input type="range" id="b-ratio" min="0.5" max="1.0" step="0.05" value="0.8" oninput="window.agentsView.updateRatio(this.value)">
              </div>
              <div class="slider-labels">
                <span>More Exploration</span>
                <span>Use Proven Strategies</span>
              </div>
            </div>
            <div class="form-group">
              <label>Self-Reflection Frequency</label>
              <select id="b-reflection" class="form-control" onchange="window.agentsView.updateBuilderData('reflectionFrequency', this.value)">
                <option value="Daily">Daily</option>
                <option value="Weekly" selected>Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Manual Only">Manual Only</option>
              </select>
            </div>
          </div>

          <!-- Step 4: Review -->
          <div id="step-4" class="wizard-step">
            <h4 style="margin-bottom: 1.5rem;">Review & Create</h4>
            <div class="card" style="background: rgba(0,0,0,0.2);">
              <div style="margin-bottom: 1rem;">
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Name & Type</div>
                <div style="font-weight: 500;" id="r-name-type">-</div>
              </div>
              <div style="margin-bottom: 1rem;">
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Primary Metric</div>
                <div style="font-weight: 500;" id="r-metric">-</div>
              </div>
              <div style="margin-bottom: 1rem;">
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Learning Settings</div>
                <div style="font-weight: 500;" id="r-learning">-</div>
              </div>
              <div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">System Prompt Snippet</div>
                <div style="font-weight: 500; font-size: 0.875rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" id="r-prompt">-</div>
              </div>
            </div>
          </div>

        </div>
        
        <div class="slide-panel-footer">
          <button class="btn btn-secondary" id="btn-back" onclick="window.agentsView.prevStep()" style="visibility: hidden;">Back</button>
          <button class="btn btn-primary" id="btn-next" onclick="window.agentsView.nextStep()">Next Step</button>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  window.agentsView = {
    openBuilder,
    closeBuilder,
    selectType,
    updateBuilderData,
    updateRatio,
    prevStep,
    nextStep,
    openDetail,
    closeDetail,
    switchTab,
    deleteAgentPrompt,
    toggleRunScorer,
    openRunForm,
    submitVoiceCall,
    submitGeneralRun,
    openRunModal
  };

  initRunScorer();
  await loadAgents();
}

export function destroy() {
  delete window.agentsView;
}

// ==========================================
// LIST VIEW
// ==========================================

async function loadAgents() {
  const user = getCurrentUser();
  if (!user) return;

  const container = document.getElementById('agents-grid-container');
  try {
    currentAgents = await listAgents(user.uid);

    if (currentAgents.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 4rem 2rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 1rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1.5rem; opacity: 0.5;">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="4"></circle>
            <line x1="21.17" y1="8" x2="12" y2="8"></line>
            <line x1="3.95" y1="6.06" x2="8.54" y2="14"></line>
            <line x1="10.88" y1="21.94" x2="15.46" y2="14"></line>
          </svg>
          <h3 style="margin-bottom: 0.5rem;">Create your first agent</h3>
          <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Build an AI agent to automate your workflows and scale your operations.</p>
          <button class="btn btn-primary" onclick="window.agentsView.openBuilder('create')">Create Agent</button>
        </div>
      `;
      return;
    }

    let html = '<div class="agents-grid">';
    currentAgents.forEach(agent => {
      const typeInfo = agentTypes.find(t => t.id === agent.type) || { name: agent.type, badge: 'badge-gray' };
      const statusClass = agent.status === 'running' ? 'active' : agent.status === 'waiting_approval' ? 'thinking' : 'idle';
      const score = agent.averageScore || 0;

      let scoreColor = 'var(--badge-coral)';
      if (score >= 75) scoreColor = 'var(--badge-teal)';
      else if (score >= 50) scoreColor = 'var(--badge-amber)';

      const radius = 50;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (score / 100) * circumference;

      const lastRun = agent.lastRunAt?.toDate ? timeAgo(agent.lastRunAt.toDate()) : 'Never';

      html += `
        <div class="agent-card">
          <div class="agent-card-header">
            <div class="agent-card-title">
              <span class="status-dot ${statusClass}" title="${agent.status || 'idle'}"></span>
              ${agent.name}
            </div>
            <span class="badge ${typeInfo.badge}">${typeInfo.name}</span>
          </div>
          
          <div class="agent-card-score">
            <div class="score-ring-large">
              <svg viewBox="0 0 120 120">
                <circle class="score-ring-bg" cx="60" cy="60" r="${radius}"></circle>
                <circle class="score-ring-fill" cx="60" cy="60" r="${radius}" 
                        stroke="${scoreColor}" 
                        stroke-dasharray="${circumference}" 
                        stroke-dashoffset="${offset}"
                        transform="rotate(-90 60 60)"></circle>
              </svg>
              <span class="score-ring-text">${Math.round(score)}</span>
            </div>
          </div>
          
          <div class="agent-card-meta">
            <span>Runs: ${agent.totalRuns || 0}</span>
            <span>Last: ${lastRun}</span>
          </div>
          
          <div class="agent-card-actions">
            <button class="btn btn-primary" style="flex: 1; padding: 0.5rem;" onclick="window.agentsView.openRunModal('${agent.agentId}')">Run</button>
            <button class="btn btn-secondary" style="flex: 1; padding: 0.5rem;" onclick="window.agentsView.openDetail('${agent.agentId}')">View</button>
            <button class="btn btn-ghost" style="padding: 0.5rem;" onclick="window.agentsView.openBuilder('edit', '${agent.agentId}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-ghost" style="padding: 0.5rem; color: var(--badge-coral);" onclick="window.agentsView.deleteAgentPrompt('${agent.agentId}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;

  } catch (error) {
    console.error("Error loading agents:", error);
    container.innerHTML = `<div class="card" style="border-color: var(--badge-coral); color: var(--badge-coral);">Failed to load agents.</div>`;
  }
}

function timeAgo(date) {
  if (!date) return 'Never';
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m";
  return Math.floor(seconds) + "s";
}

async function deleteAgentPrompt(agentId) {
  if (confirm("Are you sure you want to delete this agent? This cannot be undone.")) {
    const user = getCurrentUser();
    try {
      await deleteAgent(user.uid, agentId);
      await loadAgents();
      showToast("Agent deleted successfully.");
    } catch (e) {
      alert("Failed to delete agent.");
    }
  }
}

// ==========================================
// DETAIL VIEW
// ==========================================

async function openDetail(agentId) {
  const agent = currentAgents.find(a => a.agentId === agentId);
  if (!agent) return;
  selectedAgentId = agentId;

  document.getElementById('agents-list-view').style.display = 'none';
  document.getElementById('agent-detail-view').style.display = 'block';

  const typeInfo = agentTypes.find(t => t.id === agent.type) || { name: agent.type, badge: 'badge-gray' };

  document.getElementById('detail-agent-name').textContent = agent.name;
  const badgeEl = document.getElementById('detail-agent-badge');
  badgeEl.className = `badge ${typeInfo.badge}`;
  badgeEl.textContent = typeInfo.name;

  document.getElementById('detail-system-prompt').textContent = agent.systemPrompt || agent.baseSystemPrompt || 'No prompt defined.';
  document.getElementById('detail-metric').textContent = agent.primaryMetric || '-';
  document.getElementById('detail-runs').textContent = agent.totalRuns || 0;
  document.getElementById('detail-score').textContent = (agent.averageScore || 0).toFixed(1);

  // Handle Drift Alerts
  const driftContainer = document.getElementById('drift-alert-container');
  driftContainer.innerHTML = '';
  if (agent.alerts && agent.alerts.length > 0) {
    const unacknowledgedDrift = agent.alerts.find(a => a.type === 'drift' && !a.acknowledged);
    if (unacknowledgedDrift) {
      const isHigh = unacknowledgedDrift.severity === 'high';
      driftContainer.innerHTML = `
        <div class="card" style="margin-bottom: 1.5rem; border-color: ${isHigh ? 'var(--badge-coral)' : 'var(--badge-amber)'}; background: rgba(${isHigh ? '239, 68, 68' : '245, 158, 11'}, 0.05);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; gap: 1rem; align-items: flex-start;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${isHigh ? 'var(--badge-coral)' : 'var(--badge-amber)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
              <div>
                <h4 style="margin: 0 0 0.25rem 0; color: ${isHigh ? 'var(--badge-coral)' : 'var(--badge-amber)'};">Agent Drift Detected</h4>
                <p style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">This agent's current system prompt has drifted from its base instructions. Similarity: <strong>${(unacknowledgedDrift.similarity * 100).toFixed(1)}%</strong>.</p>
              </div>
            </div>
            <button class="btn btn-sm" style="background: rgba(255,255,255,0.1);" onclick="window.agentsView.dismissAlert('${agentId}', '${unacknowledgedDrift.createdAt.toMillis ? unacknowledgedDrift.createdAt.toMillis() : unacknowledgedDrift.createdAt}')">Dismiss</button>
          </div>
        </div>
      `;
    }
  }

  switchTab('overview');

  // Load runs and strategies in background
  const user = getCurrentUser();
  if (user) {
    listRuns(user.uid, agentId, 50).then(runs => {
      const tbody = document.getElementById('detail-runs-body');
      if (runs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No runs recorded yet.</td></tr>';
        return;
      }
      tbody.innerHTML = runs.map(r => {
        const score = r.weightedScore !== undefined && r.weightedScore !== null ? r.weightedScore : (r.primaryScore || null);
        let scoreColor = 'var(--badge-gray)';
        let scoreText = 'Unscored';

        if (score !== null) {
          if (score >= 75) scoreColor = 'var(--badge-teal)';
          else if (score >= 50) scoreColor = 'var(--badge-amber)';
          else scoreColor = 'var(--badge-coral)';
          scoreText = score.toFixed(1);
        }

        return `
          <tr style="cursor: pointer;" onclick="window.agentsView.toggleRunScorer('${r.runId}')">
            <td>${r.createdAt?.toDate ? new Date(r.createdAt.toDate()).toLocaleString() : 'Unknown'}</td>
            <td><span class="badge badge-gray">Strategy</span></td>
            <td><span id="badge-${r.runId}" class="badge" style="background: transparent; border-color: ${scoreColor}; color: ${scoreColor}">${scoreText}</span></td>
            <td>${r.durationMs ? (r.durationMs / 1000).toFixed(1) + 's' : '-'}</td>
            <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${r.outputSnapshot || '-'}</td>
          </tr>
          <tr id="scorer-row-${r.runId}" style="display: none;">
            <td colspan="5" style="padding: 0 1rem 1rem 1rem; border-bottom: 1px solid var(--border-color);">
              <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-family: var(--font-mono); font-size: 0.875rem; color: var(--text-secondary); white-space: pre-wrap;">${r.outputSnapshot || 'No output'}</div>
              ${renderRunScorer(r.runId, agentId)}
            </td>
          </tr>
        `;
      }).join('');
    });
  }
}

function openRunForm() {
  const panel = document.getElementById('run-agent-panel');
  panel.style.display = 'block';
  document.getElementById('run-active-state').style.display = 'none';
  document.getElementById('run-script-preview').style.display = 'none';

  const agent = currentAgents.find(a => a.agentId === selectedAgentId);
  if (agent && agent.type === 'voice') {
    document.getElementById('run-voice-form').style.display = 'block';
    document.getElementById('run-general-form').style.display = 'none';
  } else {
    document.getElementById('run-voice-form').style.display = 'none';
    document.getElementById('run-general-form').style.display = 'block';
  }
}

let activeRunUnsubscribe = null;

async function submitVoiceCall() {
  const phone = document.getElementById('run-voice-phone').value.trim();
  const name = document.getElementById('run-voice-name').value.trim();
  const company = document.getElementById('run-voice-company').value.trim();
  const context = document.getElementById('run-voice-context').value.trim();

  if (!phone) {
    if (window.toast) window.toast('Phone number is required', 'error');
    else alert('Phone number is required');
    return;
  }

  document.getElementById('run-voice-form').style.display = 'none';
  const activeState = document.getElementById('run-active-state');
  activeState.style.display = 'block';
  document.getElementById('run-status-text').textContent = 'Initiating call via Retell.ai...';

  const user = getCurrentUser();

  try {
    const res = await makeCall(selectedAgentId, phone, name, company, context);

    document.getElementById('run-status-text').textContent = 'Call in progress... Waiting for completion.';
    const preview = document.getElementById('run-script-preview');
    preview.style.display = 'block';
    preview.textContent = "Generated Script:\n\n" + res.scriptPreview;

    // Poll the run document
    if (activeRunUnsubscribe) activeRunUnsubscribe();
    if (user && res.runId) {
      activeRunUnsubscribe = onSnapshot(doc(db, `users/${user.uid}/agents/${selectedAgentId}/runs/${res.runId}`), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === 'call_completed') {
            document.getElementById('run-status-text').textContent = 'Call Completed! Score: ' + (data.primaryScore || 'N/A');
            if (activeRunUnsubscribe) {
              activeRunUnsubscribe();
              activeRunUnsubscribe = null;
            }
            // Optional: reload agent runs
            switchTab('runs');
          }
        }
      });
    }

  } catch (error) {
    document.getElementById('run-status-text').textContent = 'Failed to initiate call. See console.';
    document.getElementById('run-voice-form').style.display = 'block';
    setTimeout(() => {
      activeState.style.display = 'none';
    }, 3000);
  }
}

async function submitGeneralRun() {
  const task = document.getElementById('run-general-task').value;
  if (!task) {
    alert("Please enter a task description");
    return;
  }

  document.getElementById('run-general-form').style.display = 'none';
  document.getElementById('run-active-state').style.display = 'block';
  document.getElementById('run-status-text').textContent = "Executing Multi-Step Plan...";

  setTimeout(() => {
    document.getElementById('run-script-preview').style.display = 'block';
    document.getElementById('run-script-preview').textContent = "> Step 1: Analyzing task requirements...\n> Step 2: Extracting parameters...\n> Error: Integration dependencies unlinked.";
    document.getElementById('run-status-text').textContent = "Execution paused: Missing Integration.";
  }, 1500);
}

function openRunModal(agentId) {
  // If no agentId is passed, use selectedAgentId
  const targetId = agentId || selectedAgentId;
  const agent = currentAgents.find(a => a.agentId === targetId);
  if (agent && window.runModal) {
    window.runModal.open(agent);
  } else if (!window.runModal) {
    alert("Run modal system not initialized yet.");
  }
}

function toggleRunScorer(runId) {
  const row = document.getElementById(`scorer-row-${runId}`);
  if (row) {
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
  }
}

function closeDetail() {
  document.getElementById('agent-detail-view').style.display = 'none';
  document.getElementById('agents-list-view').style.display = 'block';
  selectedAgentId = null;
}

function switchTab(tabId) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const tabEl = document.querySelector(`.detail-tab[onclick*="${tabId}"]`);
  if (tabEl) tabEl.classList.add('active');

  const contentEl = document.getElementById(`tab-${tabId}`);
  if (contentEl) contentEl.classList.add('active');

  if (tabId === 'learning' && selectedAgentId) {
    const user = getCurrentUser();
    if (user) {
      renderLearningView(user.uid, selectedAgentId, document.getElementById('learning-container'));
    }
  } else if (tabId === 'versions' && selectedAgentId) {
    const user = getCurrentUser();
    if (user) {
      renderVersionHistory(user.uid, selectedAgentId, document.getElementById('versions-container'));
    }
  }
}

// ==========================================
// BUILDER WIZARD
// ==========================================

function openBuilder(mode, agentId = null) {
  document.getElementById('builder-overlay').classList.add('active');
  document.getElementById('builder-panel').classList.add('active');

  if (mode === 'create') {
    document.getElementById('builder-title').textContent = 'Create New Agent';
    builderData = {
      type: '', name: '', role: '', primaryMetric: '', baseSystemPrompt: '',
      learningEnabled: true, exploitRatio: 0.8, reflectionFrequency: 'Weekly'
    };
    selectedAgentId = null;
    goToStep(1);
  } else if (mode === 'edit' && agentId) {
    document.getElementById('builder-title').textContent = 'Edit Agent';
    const agent = currentAgents.find(a => a.agentId === agentId);
    if (agent) {
      builderData = { ...agent };
      selectedAgentId = agentId;
      // Populate fields
      document.getElementById('b-name').value = agent.name || '';
      document.getElementById('b-role').value = agent.role || '';
      document.getElementById('b-prompt').value = agent.baseSystemPrompt || agent.systemPrompt || '';
      document.getElementById('b-learning').checked = agent.learningEnabled !== false;
      document.getElementById('b-ratio').value = agent.exploitRatio || 0.8;
      document.getElementById('b-ratio-val').textContent = agent.exploitRatio || 0.8;
      document.getElementById('b-reflection').value = agent.reflectionFrequency || 'Weekly';

      selectType(agent.type, true);
      goToStep(2); // Skip type selection for edit
    }
  }
}

function closeBuilder() {
  document.getElementById('builder-overlay').classList.remove('active');
  document.getElementById('builder-panel').classList.remove('active');
}

function selectType(typeId, skipNext = false) {
  builderData.type = typeId;
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(`type-card-${typeId}`);
  if (card) card.classList.add('selected');

  // Update metrics dropdown
  const metrics = typeMetrics[typeId] || typeMetrics['autonomous'];
  const metricSelect = document.getElementById('b-metric');
  metricSelect.innerHTML = metrics.map(m => `<option value="${m}">${m}</option>`).join('');

  if (!builderData.primaryMetric || !metrics.includes(builderData.primaryMetric)) {
    builderData.primaryMetric = metrics[0];
  }
  metricSelect.value = builderData.primaryMetric;

  // Update prompt placeholder
  const promptArea = document.getElementById('b-prompt');
  promptArea.placeholder = defaultPrompts[typeId] || '';
  if (!builderData.baseSystemPrompt) {
    promptArea.value = defaultPrompts[typeId] || '';
    builderData.baseSystemPrompt = promptArea.value;
  }

  if (!skipNext) {
    setTimeout(() => nextStep(), 300);
  }
}

function updateBuilderData(key, value) {
  builderData[key] = value;
}

function updateRatio(val) {
  document.getElementById('b-ratio-val').textContent = val;
  builderData.exploitRatio = parseFloat(val);
}

function goToStep(step) {
  currentStep = step;

  // Update dots
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`dot-${i}`);
    if (i <= step) dot.classList.add('active');
    else dot.classList.remove('active');

    const stepEl = document.getElementById(`step-${i}`);
    if (i === step) stepEl.classList.add('active');
    else stepEl.classList.remove('active');
  }

  // Update buttons
  const btnBack = document.getElementById('btn-back');
  const btnNext = document.getElementById('btn-next');

  btnBack.style.visibility = step === 1 ? 'hidden' : 'visible';

  if (step === 4) {
    btnNext.textContent = selectedAgentId ? 'Save Changes' : 'Create Agent';
    populateReview();
  } else {
    btnNext.textContent = 'Next Step';
  }
}

function populateReview() {
  const typeInfo = agentTypes.find(t => t.id === builderData.type) || { name: 'Unknown' };
  document.getElementById('r-name-type').textContent = `${builderData.name || 'Unnamed'} (${typeInfo.name})`;
  document.getElementById('r-metric').textContent = builderData.primaryMetric || '-';
  document.getElementById('r-learning').textContent = `${builderData.learningEnabled ? 'Enabled' : 'Disabled'} | Ratio: ${builderData.exploitRatio} | ${builderData.reflectionFrequency}`;
  document.getElementById('r-prompt').textContent = builderData.baseSystemPrompt || '-';
}

function validateStep(step) {
  if (step === 1 && !builderData.type) {
    alert("Please select an agent type.");
    return false;
  }
  if (step === 2 && !builderData.name.trim()) {
    alert("Agent name is required.");
    return false;
  }
  if (step === 3 && !builderData.baseSystemPrompt.trim()) {
    alert("Base system prompt is required.");
    return false;
  }
  return true;
}

function prevStep() {
  if (currentStep > 1) goToStep(currentStep - 1);
}

async function nextStep() {
  if (!validateStep(currentStep)) return;

  if (currentStep < 4) {
    goToStep(currentStep + 1);
  } else {
    await submitBuilder();
  }
}

async function submitBuilder() {
  const user = getCurrentUser();
  if (!user) return;

  const btnNext = document.getElementById('btn-next');
  const originalText = btnNext.textContent;
  btnNext.textContent = 'Saving...';
  btnNext.disabled = true;

  try {
    if (selectedAgentId) {
      // Update existing
      await updateAgent(user.uid, selectedAgentId, {
        name: builderData.name,
        role: builderData.role,
        primaryMetric: builderData.primaryMetric,
        baseSystemPrompt: builderData.baseSystemPrompt,
        systemPrompt: builderData.baseSystemPrompt, // Sync for now
        learningEnabled: builderData.learningEnabled,
        exploitRatio: builderData.exploitRatio,
        reflectionFrequency: builderData.reflectionFrequency
      });
      showToast("Agent updated successfully.");
      if (document.getElementById('agent-detail-view').style.display === 'block') {
        openDetail(selectedAgentId); // refresh detail view
      }
    } else {
      // Create new
      const agentPayload = {
        name: builderData.name,
        type: builderData.type,
        role: builderData.role,
        primaryMetric: builderData.primaryMetric,
        status: 'idle',
        baseSystemPrompt: builderData.baseSystemPrompt,
        systemPrompt: builderData.baseSystemPrompt,
        learningEnabled: builderData.learningEnabled,
        exploitRatio: builderData.exploitRatio,
        reflectionFrequency: builderData.reflectionFrequency,
        totalRuns: 0,
        averageScore: 0,
        evolutionCount: 0
      };

      const newAgent = await createAgent(user.uid, agentPayload);

      // Create initial strategy
      await createStrategy(user.uid, newAgent.agentId, {
        name: "Initial Strategy",
        description: "Default strategy created during agent initialization.",
        configurationSnapshot: builderData.baseSystemPrompt,
        status: "active",
        source: "personal",
        runCount: 0,
        totalScore: 0,
        averageScore: 0
      });

      showToast("Agent created successfully.");
    }

    closeBuilder();
    await loadAgents();

  } catch (error) {
    console.error("Error saving agent:", error);
    alert("Failed to save agent. Check console.");
  } finally {
    btnNext.textContent = originalText;
    btnNext.disabled = false;
  }
}

function showToast(message) {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--badge-teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
  return container;
}
