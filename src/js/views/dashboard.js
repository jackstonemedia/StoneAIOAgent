import { getCurrentUser } from '../app.js';
import { getUser, listAgents, listPendingReflections } from '../db-helpers.js';
import { db } from '../firebase.js';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { isGuestMode } from '../auth.js';

let refreshInterval;
let runListeners = [];
let allRuns = [];
let dashAgents = [];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export async function render() {
  const user = getCurrentUser();
  const displayName = user?.displayName?.split(' ')[0] || (isGuestMode() ? 'Explorer' : 'there');

  return `
    <div class="dashboard-container">
      <!-- Welcome Header -->
      <div style="margin-bottom: 2rem;">
        <h1 style="font-family: var(--font-heading); font-size: 2rem; font-weight: 800; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.4rem;">
          <span>${getGreeting()},</span>
          <span style="background: var(--gradient-orange); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; padding-bottom: 0.1rem;">${displayName}</span>
        </h1>
        <p style="color: var(--text-secondary); font-size: 0.95rem;">Here's what's happening with your AI agents today.</p>
      </div>

      <!-- Central Prompt Bar -->
      <div style="margin: 2rem auto 4rem auto; max-width: 720px; text-align: center;">
        <div class="landing-prompt-manus" style="margin-bottom: 1rem; box-shadow: var(--shadow-sm);">
          <input type="text" placeholder="What can I do for you?" />
          <button class="landing-prompt-btn">
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
          </button>
        </div>
        <div class="landing-tags-manus">
          <span class="tags-label" style="color: var(--text-muted); font-size: 0.8rem;">Suggestions:</span>
          <button class="tag-btn">Email SDR</button>
          <button class="tag-btn">Write a Blog</button>
          <button class="tag-btn">Website Scraper</button>
        </div>
      </div>

      <!-- Quick Actions -->
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div class="action-card" onclick="window.location.hash='#agents'" style="cursor: pointer;">
          <div class="action-icon" style="background: rgba(232, 98, 44, 0.12); color: #e8622c; font-size: 1.3rem;">🚀</div>
          <div class="action-content">
            <h4>Run an Agent</h4>
            <p>Execute a task instantly</p>
          </div>
        </div>
        <div class="action-card" onclick="window.location.hash='#agents'" style="cursor: pointer;">
          <div class="action-icon" style="background: rgba(139, 92, 246, 0.12); color: #8b5cf6; font-size: 1.3rem;">✨</div>
          <div class="action-content">
            <h4>Create Agent</h4>
            <p>Build a new AI worker</p>
          </div>
        </div>
        <div class="action-card" onclick="window.location.hash='#team'" style="cursor: pointer;">
          <div class="action-icon" style="background: rgba(20, 184, 166, 0.12); color: #14b8a6; font-size: 1.3rem;">👥</div>
          <div class="action-content">
            <h4>Team View</h4>
            <p>Monitor your team live</p>
          </div>
        </div>
        <div class="action-card" onclick="window.location.hash='#marketplace'" style="cursor: pointer;">
          <div class="action-icon" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; font-size: 1.3rem;">🏪</div>
          <div class="action-content">
            <h4>Marketplace</h4>
            <p>Discover agent blueprints</p>
          </div>
        </div>
      </div>

      <!-- Section 1: Hero Stats -->
      <div class="stats-grid" id="dash-stats">
        ${renderSkeletonStats()}
      </div>

      <!-- Section 2: Two-column grid -->
      <div class="dashboard-grid">
        <div class="dashboard-col-left">
          <div class="card h-full">
            <div class="card-header">
              <h3>Agent Team Overview</h3>
            </div>
            <div class="agent-list" id="dash-agents">
              ${renderSkeletonAgents()}
            </div>
          </div>
        </div>
        
        <div class="dashboard-col-right">
          <div class="card h-full">
            <div class="card-header">
              <h3>Activity Feed</h3>
              <span class="live-indicator"><span class="status-dot active"></span> Live</span>
            </div>
            <div class="feed-list" id="dash-feed">
              ${renderSkeletonFeed()}
            </div>
          </div>
        </div>
      </div>

      <!-- Section 3: Pending Actions -->
      <div id="dash-actions-container" style="display: none; margin-top: 2rem;">
        <h3 style="margin-bottom: 1rem;">Pending Actions</h3>
        <div class="actions-grid" id="dash-actions">
        </div>
      </div>
    </div>
  `;
}

function renderSkeletonStats() {
  return Array(4).fill(0).map(() => `
    <div class="stat-card skeleton-card">
      <div class="skeleton-text skeleton-large"></div>
      <div class="skeleton-text skeleton-small"></div>
    </div>
  `).join('');
}

function renderSkeletonAgents() {
  return Array(3).fill(0).map(() => `
    <div class="agent-row skeleton-row">
      <div class="agent-row-left">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-text" style="width: 120px; margin: 0;"></div>
      </div>
      <div class="skeleton-text" style="width: 60px; margin: 0;"></div>
    </div>
  `).join('');
}

function renderSkeletonFeed() {
  return Array(4).fill(0).map(() => `
    <div class="feed-item skeleton-row" style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; border-left-color: var(--border-color);">
      <div class="skeleton-text" style="width: 100px; margin: 0;"></div>
      <div class="skeleton-text" style="width: 100%; margin: 0;"></div>
    </div>
  `).join('');
}

export async function init() {
  await loadDashboardData();

  // Refresh every 30 seconds
  refreshInterval = setInterval(loadDashboardData, 30000);
}

// Cleanup function when navigating away
export function destroy() {
  if (refreshInterval) clearInterval(refreshInterval);
  runListeners.forEach(unsubscribe => unsubscribe());
  runListeners = [];
  delete window.dashView;
}

async function loadDashboardData() {
  const user = getCurrentUser();
  if (!user && !isGuestMode()) return;

  if (isGuestMode()) {
    renderStats(null, []);
    renderGuestAgents();
    return;
  }
  try {
    const [userData, agents] = await Promise.all([
      getUser(user.uid),
      listAgents(user.uid)
    ]);

    dashAgents = agents;

    renderStats(userData, agents);
    renderAgents(agents);
    setupFeedListeners(user.uid, agents);
    await renderPendingActions(user.uid, agents);

    window.dashView = {
      openRunModal: (id) => {
        const agent = dashAgents.find(a => a.agentId === id);
        if (agent && window.runModal) {
          window.runModal.open(agent);
        }
      }
    };

  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

function renderGuestAgents() {
  const container = document.getElementById('dash-agents');
  const feedContainer = document.getElementById('dash-feed');
  if (container) {
    container.innerHTML = `
      <div class="empty-state">
        <p style="font-size: 0.9rem;">Sign in to see your agents here.</p>
        <a href="#agents" class="btn btn-primary btn-sm" style="margin-top: 0.75rem;">Get Started</a>
      </div>
    `;
  }
  if (feedContainer) {
    feedContainer.innerHTML = `
      <div class="empty-state">
        <p style="font-size: 0.9rem;">Activity will appear here once you start running agents.</p>
      </div>
    `;
  }
}

function animateValue(obj, start, end, duration) {
  if (!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    // easeOutQuart
    const easeProgress = 1 - Math.pow(1 - progress, 4);
    let current = progress === 1 ? end : start + (end - start) * easeProgress;

    if (end % 1 !== 0) {
      obj.innerHTML = current.toFixed(1);
    } else {
      obj.innerHTML = Math.floor(current);
    }

    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

function renderStats(userData, agents) {
  const statsContainer = document.getElementById('dash-stats');
  if (!statsContainer) return;

  const totalAgents = agents.length;
  const runsToday = userData?.agentRunsToday || 0;

  let totalScore = 0;
  let scoredAgents = 0;
  let activeAgents = 0;

  agents.forEach(a => {
    if (a.averageScore) {
      totalScore += a.averageScore;
      scoredAgents++;
    }
    if (a.status === 'running') {
      activeAgents++;
    }
  });

  const avgScore = scoredAgents > 0 ? (totalScore / scoredAgents) : 0;

  statsContainer.innerHTML = `
    <div class="stat-card">
      <div class="stat-value" id="stat-total-agents">0</div>
      <div class="stat-label">Total Agents</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="stat-runs-today">0</div>
      <div class="stat-label">Runs Today</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="stat-avg-score">0</div>
      <div class="stat-label">Platform Avg Score</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="stat-active-agents">0</div>
      <div class="stat-label">Active Agents</div>
    </div>
  `;

  setTimeout(() => {
    animateValue(document.getElementById('stat-total-agents'), 0, totalAgents, 1500);
    animateValue(document.getElementById('stat-runs-today'), 0, runsToday, 1500);
    animateValue(document.getElementById('stat-avg-score'), 0, avgScore, 1500);
    animateValue(document.getElementById('stat-active-agents'), 0, activeAgents, 1500);
  }, 100);
}

function getScoreColor(score) {
  if (score >= 75) return 'var(--badge-teal)';
  if (score >= 50) return 'var(--badge-amber)';
  return 'var(--badge-coral)';
}

function renderScoreRing(score) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const safeScore = score || 0;
  const offset = circumference - (safeScore / 100) * circumference;
  const color = getScoreColor(safeScore);

  return `
    <div class="score-ring-container" title="Score: ${safeScore.toFixed(1)}">
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle class="score-ring-bg" cx="18" cy="18" r="${radius}"></circle>
        <circle class="score-ring-fill" cx="18" cy="18" r="${radius}" 
                stroke="${color}" 
                stroke-dasharray="${circumference}" 
                stroke-dashoffset="${offset}"
                transform="rotate(-90 18 18)"></circle>
      </svg>
      <span class="score-ring-text">${Math.round(safeScore)}</span>
    </div>
  `;
}

function timeAgo(date) {
  if (!date) return 'Never';
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return Math.floor(seconds) + "s ago";
}

function renderAgents(agents) {
  const container = document.getElementById('dash-agents');
  if (!container) return;

  if (agents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No agents yet. Create your first agent.</p>
        <a href="#agents" class="btn btn-primary" style="margin-top: 1rem;">Create Agent</a>
      </div>
    `;
    return;
  }

  let html = '';
  agents.forEach(agent => {
    const statusClass = agent.status === 'running' ? 'active' :
      agent.status === 'waiting_approval' ? 'thinking' : 'idle';

    const lastRunDate = agent.lastRunAt?.toDate ? agent.lastRunAt.toDate() : null;

    html += `
      <div class="agent-row" onclick="window.location.hash='#agents'">
        <div class="agent-row-left">
          <span class="status-dot ${statusClass}" title="${agent.status || 'idle'}"></span>
          <span class="agent-name">${agent.name || 'Unnamed Agent'}</span>
          <span class="badge badge-purple">${agent.type || 'unknown'}</span>
        </div>
        <div class="agent-row-right">
          <span class="agent-time">${timeAgo(lastRunDate)}</span>
          <div style="margin-right: 1rem;">${renderScoreRing(agent.averageScore)}</div>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); window.dashView.openRunModal('${agent.agentId}')">Run</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function setupFeedListeners(uid, agents) {
  runListeners.forEach(unsubscribe => unsubscribe());
  runListeners = [];
  allRuns = [];

  if (agents.length === 0) {
    renderFeed();
    return;
  }

  agents.forEach(agent => {
    const runsRef = collection(db, 'users', uid, 'agents', agent.agentId, 'runs');
    const q = query(
      runsRef,
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const runData = change.doc.data();
        runData.agentName = agent.name;

        if (change.type === "added" || change.type === "modified") {
          const existingIndex = allRuns.findIndex(r => r.runId === runData.runId);
          if (existingIndex >= 0) {
            allRuns[existingIndex] = runData;
          } else {
            allRuns.push(runData);
          }
        }
        if (change.type === "removed") {
          allRuns = allRuns.filter(r => r.runId !== runData.runId);
        }
      });

      allRuns.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      allRuns = allRuns.slice(0, 50);
      renderFeed();
    }, (error) => {
      console.error("Error listening to runs:", error);
    });

    runListeners.push(unsubscribe);
  });
}

function renderFeed() {
  const container = document.getElementById('dash-feed');
  if (!container) return;

  if (allRuns.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No recent activity.</p>
      </div>
    `;
    return;
  }

  let html = '';
  allRuns.forEach((run, index) => {
    const score = run.primaryScore || 0;
    let borderClass = 'border-red';
    if (score >= 75) borderClass = 'border-green';
    else if (score >= 50) borderClass = 'border-amber';

    const runDate = run.createdAt?.toDate ? run.createdAt.toDate() : new Date();
    const outputSnippet = run.outputSnapshot ?
      (run.outputSnapshot.substring(0, 60) + (run.outputSnapshot.length > 60 ? '...' : '')) :
      'No output recorded.';

    const delay = Math.min(index * 0.05, 0.5);

    html += `
      <div class="feed-item ${borderClass}" style="animation-delay: ${delay}s">
        <div class="feed-item-header">
          <span class="feed-agent-name">${run.agentName || 'Agent'}</span>
          <div class="feed-meta">
            <span class="feed-score" style="color: ${getScoreColor(score)}">${score.toFixed(1)}</span>
            <span class="feed-time">${timeAgo(runDate)}</span>
          </div>
        </div>
        <div class="feed-output">${outputSnippet}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function renderPendingActions(uid, agents) {
  const container = document.getElementById('dash-actions-container');
  const grid = document.getElementById('dash-actions');
  if (!container || !grid) return;

  let actionsHtml = '';

  for (const agent of agents) {
    if (agent.suggestExperiment) {
      actionsHtml += `
        <div class="action-card">
          <div class="action-icon" style="background: rgba(139, 92, 246, 0.12); color: var(--accent-purple);">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><circle cx="12" cy="15" r="2"/></svg>
          </div>
          <div class="action-content">
            <h4>Experiment Suggested</h4>
            <p>${agent.name} has a new experiment proposal.</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#experiments'">Review</button>
        </div>
      `;
    }

    if (agent.proposedSystemPrompt) {
      actionsHtml += `
        <div class="action-card">
          <div class="action-icon" style="background: rgba(245, 158, 11, 0.12); color: var(--badge-amber);">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="action-content">
            <h4>Prompt Evolution</h4>
            <p>${agent.name} proposed a system prompt update.</p>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#agents'">Review</button>
        </div>
      `;
    }

    try {
      const reflections = await listPendingReflections(uid, agent.agentId);
      if (reflections && reflections.length > 0) {
        actionsHtml += `
          <div class="action-card">
            <div class="action-icon" style="background: rgba(20, 184, 166, 0.12); color: var(--badge-teal);">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
            <div class="action-content">
              <h4>Pending Reflection</h4>
              <p>${agent.name} has ${reflections.length} reflection(s) to review.</p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#learning'">Review</button>
          </div>
        `;
      }
    } catch (e) {
      console.error("Error fetching reflections for", agent.name, e);
    }
  }

  if (actionsHtml) {
    grid.innerHTML = actionsHtml;
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}
