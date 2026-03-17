import { getCurrentUser } from '../app.js';
import { db } from '../firebase.js';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { createTeamMemory } from '../db-helpers.js';

let listeners = [];
let agentsData = [];
let runsData = [];
let memoryData = [];

export async function render() {
  return `
    <div class="team-view-container" style="display: flex; flex-direction: column; height: calc(100vh - 80px); overflow: hidden;">
      
      <!-- TOP: Team Health Bar -->
      <div class="team-health-bar" style="display: flex; border-top: 2px solid var(--accent-purple); background: var(--bg-card); border-bottom: 1px solid var(--border-color); padding: 1rem;">
        <div style="flex: 1; text-align: center; border-right: 1px solid var(--border-color);">
          <div style="font-size: 0.85rem; color: var(--text-secondary);">Agents Online</div>
          <div id="tv-agents-online" style="font-size: 1.5rem; font-weight: 600;">0</div>
        </div>
        <div style="flex: 1; text-align: center; border-right: 1px solid var(--border-color);">
          <div style="font-size: 0.85rem; color: var(--text-secondary);">Runs Today</div>
          <div id="tv-runs-today" style="font-size: 1.5rem; font-weight: 600;">0</div>
        </div>
        <div style="flex: 1; text-align: center; border-right: 1px solid var(--border-color);">
          <div style="font-size: 0.85rem; color: var(--text-secondary);">Team Avg Score</div>
          <div id="tv-avg-score" style="font-size: 1.5rem; font-weight: 600;">0.0</div>
        </div>
        <div style="flex: 1; text-align: center;">
          <div style="font-size: 0.85rem; color: var(--text-secondary);">Best Agent Today</div>
          <div id="tv-best-agent" style="font-size: 1.5rem; font-weight: 600; color: var(--accent-purple);">--</div>
        </div>
      </div>

      <!-- MIDDLE/RIGHT container -->
      <div style="display: flex; flex: 1; overflow: hidden;">
        
        <!-- MIDDLE: Agent Workstation Grid -->
        <div style="flex: 1; overflow-y: auto; padding: 1.5rem;">
          <h2 style="margin-top: 0; margin-bottom: 1.5rem;">Agent Workstations</h2>
          <div id="tv-workstation-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.5rem;">
            <!-- Agent Cards -->
          </div>
        </div>

        <!-- RIGHT: Live Activity Feed -->
        <div style="width: 300px; border-left: 1px solid var(--border-color); background: var(--bg-color); display: flex; flex-direction: column;">
          <div style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;">Live Activity Feed</h3>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm tv-filter active" data-filter="all">All</button>
              <button class="btn btn-secondary btn-sm tv-filter" data-filter="good">Good (&gt;75)</button>
              <button class="btn btn-secondary btn-sm tv-filter" data-filter="poor">Poor (&lt;50)</button>
              <button class="btn btn-secondary btn-sm tv-filter" data-filter="none">No Score</button>
            </div>
          </div>
          <div id="tv-feed-list" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem;">
            <!-- Feed Items -->
          </div>
        </div>
      </div>

      <!-- BOTTOM: Team Memory Panel (Collapsible) -->
      <div class="team-memory-panel" style="background: var(--bg-card); border-top: 1px solid var(--border-color); transition: height 0.3s ease; display: flex; flex-direction: column;">
        <div style="padding: 0.5rem 1rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color);">
          <h4 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            Team Memory
          </h4>
          <button id="tv-toggle-memory" class="btn btn-secondary btn-sm" style="background: transparent; border: none;">
            <svg id="tv-toggle-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
        </div>
        
        <div id="tv-memory-content" style="height: 180px; padding: 1rem; display: flex; gap: 1rem; overflow-x: auto; align-items: flex-start;">
          
          <!-- Add Insight Button/Form -->
          <div style="min-width: 250px; background: rgba(0,0,0,0.03); border: 1px dashed var(--border-color); border-radius: 8px; padding: 1rem; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; cursor: pointer;" id="tv-add-insight-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <span style="margin-top: 0.5rem; font-weight: 500;">Add Insight</span>
          </div>

          <!-- Memory Chips container -->
          <div id="tv-memory-chips" style="display: flex; gap: 1rem; height: 100%;">
            <!-- Chips injected here -->
          </div>

        </div>
      </div>
      
    </div>
    
    <!-- Add Insight Modal -->
    <div id="tv-insight-modal" class="modal-backdrop" style="display: none;">
      <div class="modal-content" style="width: 400px;">
        <div class="modal-header">
          <h3>Add Team Insight</h3>
          <button class="btn-close" id="tv-close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Insight Text</label>
            <textarea id="tv-insight-text" class="input" rows="3" placeholder="What did the team learn?"></textarea>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="tv-insight-category" class="input">
              <option value="Best Practice">Best Practice</option>
              <option value="Warning">Warning</option>
              <option value="Rule">Rule</option>
            </select>
          </div>
          <div class="form-group">
            <label>Score Impact</label>
            <input type="number" id="tv-insight-score" class="input" value="0" />
          </div>
          <button id="tv-save-insight" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Save Insight</button>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  const user = getCurrentUser();
  if (!user) return;

  setupMemoryToggle();
  setupAddInsightModal(user.uid);
  setupFeedFilters();

  window.teamView = {
    openRunModal: (id) => {
      const agent = agentsData.find(a => a.agentId === id);
      if (agent && window.runModal) {
        window.runModal.open(agent);
      }
    }
  };

  // 1. Listen to Agents
  const agentsRef = collection(db, 'users', user.uid, 'agents');
  const unsubAgents = onSnapshot(agentsRef, (snapshot) => {
    agentsData = snapshot.docs.map(doc => doc.data());
    updateHealthBar();
    renderWorkstations();
    listenToAllRuns(user.uid); // setup run listeners when agents change
  }, (error) => console.error("Agents listener error:", error));

  listeners.push(unsubAgents);

  // 2. Listen to Team Memory
  const memoryRef = collection(db, 'users', user.uid, 'teamMemory');
  const memoryQ = query(memoryRef, orderBy('createdAt', 'desc'));
  const unsubMemory = onSnapshot(memoryQ, (snapshot) => {
    memoryData = snapshot.docs.map(doc => doc.data());
    renderMemory();
  }, (error) => console.error("Memory listener error:", error));

  listeners.push(unsubMemory);
}

export function destroy() {
  listeners.forEach(unsub => unsub());
  listeners = [];
  runsData = [];
  agentsData = [];
  delete window.teamView;
}

let runListeners = [];

function listenToAllRuns(uid) {
  // Clear existing run listeners
  runListeners.forEach(u => u());
  runListeners = [];

  let tempRuns = new Map();

  agentsData.forEach(agent => {
    const runsRef = collection(db, 'users', uid, 'agents', agent.agentId, 'runs');
    // For last 24h, normally we'd query where createdAt > 24h ago
    // Simple approach: grab last 30 per agent and sort client side
    const q = query(runsRef, orderBy('createdAt', 'desc'), limit(15));

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        const run = change.doc.data();
        run.agentName = agent.name;
        run.agentType = agent.type;
        if (change.type === 'added' || change.type === 'modified') {
          tempRuns.set(run.runId, run);
        }
        if (change.type === 'removed') {
          tempRuns.delete(run.runId);
        }
      });

      runsData = Array.from(tempRuns.values())
        .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
        .slice(0, 30);

      renderFeed();
      updateHealthBar(); // Runs today might change
    });

    runListeners.push(unsub);
    listeners.push(unsub);
  });
}

// --- UI Rentering Functions ---

function updateHealthBar() {
  const onlineCount = agentsData.filter(a => a.status === 'running').length;

  // Calculate runs today from runsData
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const runsToday = runsData.filter(r => (r.createdAt?.toMillis() || 0) >= startOfDay).length;

  // Avg score
  let totalScore = 0;
  let scoredCount = 0;
  let bestAgent = '--';
  let highestScore = -1;

  agentsData.forEach(a => {
    if (a.averageScore !== undefined) {
      totalScore += a.averageScore;
      scoredCount++;
      if (a.averageScore > highestScore) {
        highestScore = a.averageScore;
        bestAgent = a.name;
      }
    }
  });

  const avgScore = scoredCount > 0 ? (totalScore / scoredCount) : 0;

  document.getElementById('tv-agents-online').textContent = onlineCount;
  document.getElementById('tv-runs-today').textContent = runsToday; // this might just sum up actual runs
  document.getElementById('tv-avg-score').textContent = avgScore.toFixed(1);
  if (bestAgent !== '--') {
    document.getElementById('tv-best-agent').textContent = bestAgent;
  }
}

function timeAgo(date) {
  if (!date) return 'Never';
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return Math.floor(seconds) + "s ago";
}

function renderScoreSparkline(scores) {
  if (!scores || scores.length === 0) {
    return `<svg width="60" height="30"><text x="0" y="20" fill="gray" font-size="10">No scores</text></svg>`;
  }
  const maxScore = 100;
  const barWidth = 4;
  const gap = 2;
  const width = Math.min(scores.length, 10) * (barWidth + gap);
  const height = 30;

  let html = `<svg width="${width}" height="${height}">`;
  const recentScores = scores.slice(-10); // take last 10

  recentScores.forEach((score, i) => {
    const x = i * (barWidth + gap);
    const h = Math.max((score / maxScore) * height, 2);
    const y = height - h;
    let fill = 'var(--badge-coral)';
    if (score >= 75) fill = 'var(--badge-teal)';
    else if (score >= 50) fill = 'var(--badge-amber)';

    html += `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${fill}" rx="1"/>`;
  });
  html += '</svg>';
  return html;
}

function renderWorkstations() {
  const container = document.getElementById('tv-workstation-grid');
  if (!container) return;

  if (agentsData.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary);">No agents found. Create one in the agents menu.</div>';
    return;
  }

  let html = '';
  agentsData.forEach(agent => {
    const isActive = agent.status === 'running';
    const borderStyle = isActive ? 'border: 1px solid var(--accent-purple); box-shadow: 0 0 10px rgba(232, 98, 44, 0.2);' : 'border: 1px solid var(--border-color);';

    // Status visual
    let statusDot = 'bg-gray-500';
    let statusText = 'Ready';
    let middleContent = '';

    if (isActive) {
      statusDot = 'bg-green-500 pulsing';
      statusText = 'Running';
      const taskDesc = agent.currentTask || "Executing strategy...";
      middleContent = `
        <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom: 4px;">Working on...</div>
        <div style="overflow:hidden; white-space:nowrap; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px;">
          <div style="animation: marquee 5s linear infinite; display:inline-block;">${taskDesc}</div>
        </div>
      `;
    } else if (agent.status === 'waiting_approval') {
      statusDot = 'bg-amber-500';
      statusText = 'Waiting Approval';
      middleContent = `
        <div style="color: var(--badge-amber); font-size: 0.9rem; animation: pulse 2s infinite;">Waiting for your approval</div>
      `;
    } else {
      middleContent = `
        <div style="font-size:0.9rem;">Ready</div>
        <div style="font-size:0.8rem; color:var(--text-secondary);">${timeAgo(agent.lastRunAt?.toDate())}</div>
      `;
    }

    // Agent history for sparkline
    const historyScores = agent.lastScores || [];

    html += `
      <div class="card" style="width: 280px; padding: 1rem; border-radius: 12px; ${borderStyle}">
        
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
          <div style="display:flex; align-items:center; gap: 0.5rem;">
            <div style="width:10px; height:10px; border-radius:50%;" class="${statusDot}"></div>
            <div style="font-weight: 600;">${agent.name}</div>
          </div>
          <span class="badge badge-purple">${agent.type || 'Agent'}</span>
        </div>
        
        <div style="height: 60px; margin-bottom: 1rem;">
          ${middleContent}
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px;">Performance</div>
            ${renderScoreSparkline(historyScores)}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.2rem; font-weight: 600;">${(agent.averageScore || 0).toFixed(1)}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">Avg Score</div>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-secondary);">
          <div>Runs today: ${agent.runsToday || 0}</div>
          <div style="display:flex; gap: 0.5rem;">
            <button class="btn btn-primary btn-sm" style="padding: 4px 12px; font-weight: 600;" onclick="window.teamView.openRunModal('${agent.agentId}')">Run</button>
            <button class="btn btn-secondary btn-sm" style="padding: 4px 8px;" title="View Settings" onclick="window.location.hash='#agents'"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

let currentFeedFilter = 'all';

function setupFeedFilters() {
  const btns = document.querySelectorAll('.tv-filter');
  btns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      btns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFeedFilter = e.target.dataset.filter;
      renderFeed();
    });
  });
}

function renderFeed() {
  const container = document.getElementById('tv-feed-list');
  if (!container) return;

  let filtered = runsData;
  if (currentFeedFilter === 'good') filtered = runsData.filter(r => r.primaryScore >= 75);
  else if (currentFeedFilter === 'poor') filtered = runsData.filter(r => r.primaryScore < 50 && r.primaryScore !== undefined);
  else if (currentFeedFilter === 'none') filtered = runsData.filter(r => r.primaryScore === undefined);

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary); font-size: 0.9rem;">No recent activity.</div>';
    return;
  }

  let html = '';
  filtered.forEach((run, index) => {
    const score = run.primaryScore;
    let colorClass = 'border-gray';
    let scoreBadge = '';

    if (score !== undefined) {
      if (score >= 75) { colorClass = 'border-green'; scoreBadge = `<span class="badge badge-teal">${score}</span>`; }
      else if (score >= 50) { colorClass = 'border-amber'; scoreBadge = `<span class="badge badge-amber">${score}</span>`; }
      else { colorClass = 'border-red'; scoreBadge = `<span class="badge badge-coral">${score}</span>`; }
    } else {
      scoreBadge = `<span class="badge">N/A</span>`;
    }

    const initial = run.agentName ? run.agentName.substring(0, 2).toUpperCase() : 'AG';
    const taskTitle = run.taskDescription ? (run.taskDescription.substring(0, 50) + (run.taskDescription.length > 50 ? '...' : '')) : 'Executed strategy';

    html += `
      <div class="feed-item ${colorClass}" style="animation: slideInRight 0.3s ease forwards; opacity: 0; padding-left: 0.8rem; border-left: 3px solid; border-left-color: inherit; background: rgba(255,255,255,0.02); padding: 0.8rem; border-radius: 0 8px 8px 0;">
        <div style="display: flex; gap: 0.8rem; align-items: flex-start;">
          <div style="min-width: 32px; height: 32px; border-radius: 50%; background: var(--card-lighter); display: flex; align-items:center; justify-content:center; font-size: 0.8rem; font-weight:bold; border: 1px solid var(--border-color);">
            ${initial}
          </div>
          <div style="flex: 1; overflow: hidden;">
            <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 4px;">
              <span style="font-weight: 500; font-size: 0.9rem;">${run.agentName}</span>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">${timeAgo(run.createdAt?.toDate())}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${taskTitle}
            </div>
            <div>${scoreBadge}</div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function setupMemoryToggle() {
  const panel = document.querySelector('.team-memory-panel');
  const toggleBtn = document.getElementById('tv-toggle-memory');
  const content = document.getElementById('tv-memory-content');
  const icon = document.getElementById('tv-toggle-icon');

  let isOpen = true;
  toggleBtn.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      content.style.display = 'flex';
      icon.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';
    } else {
      content.style.display = 'none';
      icon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
    }
  });
}

function renderMemory() {
  const container = document.getElementById('tv-memory-chips');
  if (!container) return;

  if (memoryData.length === 0) {
    container.innerHTML = '<div style="color:var(--text-secondary); display:flex; align-items:center; font-size:0.9rem;">No insights added yet.</div>';
    return;
  }

  let html = '';
  memoryData.forEach(insight => {
    const textSnippet = insight.text ? (insight.text.substring(0, 55) + (insight.text.length > 55 ? '...' : '')) : '';
    let catBadgeColor = 'badge-purple';
    if (insight.category === 'Warning') catBadgeColor = 'badge-amber';
    if (insight.category === 'Rule') catBadgeColor = 'badge-coral';

    html += `
      <div class="card" style="min-width: 250px; max-width: 300px; padding: 1rem; border-radius: 8px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <span class="badge ${catBadgeColor}" style="margin-bottom: 0.5rem; display:inline-block;">${insight.category}</span>
          <div style="font-size: 0.9rem; line-height: 1.4;">"${textSnippet}"</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Score Impact:</span>
          <span style="font-weight:bold; color: ${insight.scoreImpact > 0 ? 'var(--badge-teal)' : (insight.scoreImpact < 0 ? 'var(--badge-coral)' : 'inherit')}">${insight.scoreImpact > 0 ? '+' : ''}${insight.scoreImpact}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function setupAddInsightModal(uid) {
  const modal = document.getElementById('tv-insight-modal');
  const closeBtn = document.getElementById('tv-close-modal');
  const addBtn = document.getElementById('tv-add-insight-btn');
  const saveBtn = document.getElementById('tv-save-insight');

  addBtn.addEventListener('click', () => modal.style.display = 'flex');
  closeBtn.addEventListener('click', () => modal.style.display = 'none');

  saveBtn.addEventListener('click', async () => {
    const text = document.getElementById('tv-insight-text').value;
    const cat = document.getElementById('tv-insight-category').value;
    const scoreText = document.getElementById('tv-insight-score').value;
    const score = parseInt(scoreText, 10) || 0;

    if (!text.trim()) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      await createTeamMemory(uid, {
        text,
        category: cat,
        scoreImpact: score,
        applicableAgentTypes: ['All']
      });
      document.getElementById('tv-insight-text').value = '';
      modal.style.display = 'none';
      if (window.toast) toast('Insight saved', 'success');
    } catch (e) {
      console.error(e);
      if (window.toast) toast('Error saving insight', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Insight';
    }
  });
}

// Add CSS keyframes dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes marquee {
    0%   { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  @keyframes slideInRight {
    from { transform: translateX(20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .bg-green-500 { background-color: #10b981; }
  .bg-amber-500 { background-color: #f59e0b; }
  .bg-gray-500 { background-color: #6b7280; }
  .pulsing { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); animation: pulse-dot 1.5s infinite; }
  @keyframes pulse-dot {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }
`;
document.head.appendChild(style);
