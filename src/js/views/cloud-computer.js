import { getCurrentUser } from '../app.js';
import { isGuestMode } from '../auth.js';
import { db } from '../firebase.js';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';

let listeners = [];
let sessions = [];

const ENVIRONMENTS = [
  { id: 'browser', name: 'Browser Agent', icon: '🌐', desc: 'Automate web tasks with a headless browser', color: '#e8622c', specs: '2 vCPU • 4GB RAM • Chrome' },
  { id: 'scraper', name: 'Data Scraper', icon: '🕷️', desc: 'Extract and structure data from any website', color: '#8b5cf6', specs: '2 vCPU • 4GB RAM • Python' },
  { id: 'monitor', name: 'Web Monitor', icon: '📡', desc: 'Watch pages for changes and get alerted', color: '#14b8a6', specs: '1 vCPU • 2GB RAM • Node.js' },
  { id: 'notebook', name: 'AI Notebook', icon: '📓', desc: 'Run analysis with Python + AI models', color: '#f59e0b', specs: '4 vCPU • 8GB RAM • Python + GPU' },
  { id: 'api', name: 'API Worker', icon: '⚡', desc: 'Run long API workflows without timeouts', color: '#60a5fa', specs: '2 vCPU • 4GB RAM • Node.js' },
  { id: 'custom', name: 'Custom Task', icon: '🔧', desc: 'Configure your own cloud environment', color: '#a78bfa', specs: 'Configurable' }
];

export async function render() {
  return `
    <div class="dashboard-container" style="max-width: 1200px; margin: 0 auto;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem;">
        <div>
          <h1 style="font-family: var(--font-heading); font-size: 2rem; font-weight: 800; margin-bottom: 0.25rem;">
            <span style="background: var(--gradient-hero); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Cloud Computer</span>
          </h1>
          <p style="color: var(--text-secondary); font-size: 0.95rem;">Launch virtual machines to run your AI agents in the cloud.</p>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div id="cc-status-indicator" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: rgba(20, 184, 166, 0.08); border: 1px solid rgba(20, 184, 166, 0.2); border-radius: var(--radius-full); font-size: 0.8rem; color: var(--badge-teal);">
            <span class="status-dot idle"></span>
            <span id="cc-status-text">No active sessions</span>
          </div>
        </div>
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
          <span class="tags-label" style="color: var(--text-muted); font-size: 0.8rem;">Launch Environment:</span>
          <button class="tag-btn" onclick="window.cloudView.launchSession('browser')">Browser Agent</button>
          <button class="tag-btn" onclick="window.cloudView.launchSession('scraper')">Data Scraper</button>
          <button class="tag-btn" onclick="window.cloudView.launchSession('notebook')">AI Notebook</button>
        </div>
      </div>

      <!-- Resource Overview -->
      <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 2rem;">
        <div class="stat-card">
          <div class="stat-value" id="cc-active">0</div>
          <div class="stat-label">Active Sessions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="cc-total-hours">0h</div>
          <div class="stat-label">Total Runtime</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="cc-cpu">0%</div>
          <div class="stat-label">CPU Usage</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" id="cc-ram">0%</div>
          <div class="stat-label">Memory Usage</div>
        </div>
      </div>

      <!-- Quick Launch -->
      <div class="card" style="margin-bottom: 2rem;">
        <div class="card-header">
          <h3 style="margin: 0;">Quick Launch</h3>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Select an environment to start</span>
        </div>
        <div id="cc-environments" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;">
          ${ENVIRONMENTS.map(env => `
            <div class="cc-env-card" data-env="${env.id}" onclick="window.cloudView.launchSession('${env.id}')"
                 style="padding: 1.25rem; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); cursor: pointer; transition: var(--transition); position: relative; overflow: hidden;">
              <div style="position: absolute; top: 0; left: 0; right: 0; height: 2px; background: ${env.color}; opacity: 0.5;"></div>
              <div style="font-size: 1.5rem; margin-bottom: 0.75rem;">${env.icon}</div>
              <h4 style="margin: 0 0 0.25rem 0; font-size: 0.9rem;">${env.name}</h4>
              <p style="margin: 0 0 0.75rem 0; font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4;">${env.desc}</p>
              <div style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">${env.specs}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Active Sessions -->
      <div class="card" style="margin-bottom: 2rem;">
        <div class="card-header">
          <h3 style="margin: 0;">Active Sessions</h3>
          <span class="live-indicator"><span class="status-dot active"></span> Live</span>
        </div>
        <div id="cc-sessions">
          <div class="empty-state" style="padding: 2rem;">
            <p style="font-size: 0.9rem; color: var(--text-muted);">No active sessions. Launch an environment above to get started.</p>
          </div>
        </div>
      </div>

      <!-- Session Logs -->
      <div class="card">
        <div class="card-header">
          <h3 style="margin: 0;">Session Logs</h3>
          <button class="btn btn-ghost btn-sm" id="cc-clear-logs" onclick="window.cloudView.clearLogs()">Clear</button>
        </div>
        <div id="cc-logs" style="background: rgba(0,0,0,0.3); border-radius: var(--radius-sm); padding: 1rem; font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-secondary); max-height: 300px; overflow-y: auto; line-height: 1.8;">
          <div style="color: var(--text-muted);">Waiting for session activity...</div>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  const user = getCurrentUser();

  window.cloudView = {
    launchSession: async (envId) => {
      if (isGuestMode()) {
        const { checkGuestLimit } = await import('../auth.js');
        if (!checkGuestLimit('launch a cloud session')) return;
      }

      const env = ENVIRONMENTS.find(e => e.id === envId);
      if (!env) return;

      // Create session
      const sessionId = crypto.randomUUID();
      const session = {
        sessionId,
        envId: env.id,
        envName: env.name,
        envIcon: env.icon,
        envColor: env.color,
        specs: env.specs,
        status: 'starting',
        startedAt: new Date().toISOString(),
        cpuUsage: 0,
        ramUsage: 0,
        logs: []
      };

      sessions.push(session);
      renderSessions();
      addLog(`[${env.name}] Session ${sessionId.substring(0, 8)} starting...`);

      // Simulate startup
      setTimeout(() => {
        session.status = 'running';
        session.cpuUsage = Math.floor(Math.random() * 30) + 10;
        session.ramUsage = Math.floor(Math.random() * 40) + 20;
        renderSessions();
        updateStats();
        addLog(`[${env.name}] ✓ Environment ready. All services operational.`);
        addLog(`[${env.name}] Allocated: ${env.specs}`);
      }, 2000);

      // Persist to Firestore if authenticated
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'cloudSessions', sessionId), {
            ...session,
            createdAt: serverTimestamp(),
            uid: user.uid
          });
        } catch (e) {
          console.error('Error saving session:', e);
        }
      }

      updateStats();
    },

    stopSession: async (sessionId) => {
      const idx = sessions.findIndex(s => s.sessionId === sessionId);
      if (idx === -1) return;

      const session = sessions[idx];
      session.status = 'stopping';
      renderSessions();
      addLog(`[${session.envName}] Shutting down session ${sessionId.substring(0, 8)}...`);

      setTimeout(() => {
        sessions.splice(idx, 1);
        renderSessions();
        updateStats();
        addLog(`[${session.envName}] Session terminated.`);
      }, 1500);

      if (user) {
        try { await deleteDoc(doc(db, 'users', user.uid, 'cloudSessions', sessionId)); } catch (e) { }
      }
    },

    restartSession: async (sessionId) => {
      const session = sessions.find(s => s.sessionId === sessionId);
      if (!session) return;
      session.status = 'restarting';
      renderSessions();
      addLog(`[${session.envName}] Restarting...`);
      setTimeout(() => {
        session.status = 'running';
        session.cpuUsage = Math.floor(Math.random() * 30) + 10;
        session.ramUsage = Math.floor(Math.random() * 40) + 20;
        renderSessions();
        addLog(`[${session.envName}] ✓ Restart complete.`);
      }, 2000);
    },

    clearLogs: () => {
      const logsEl = document.getElementById('cc-logs');
      if (logsEl) logsEl.innerHTML = '<div style="color: var(--text-muted);">Logs cleared.</div>';
    }
  };

  // Load existing sessions from Firestore
  if (user) {
    const sessionsRef = collection(db, 'users', user.uid, 'cloudSessions');
    const q = query(sessionsRef, orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      // Only load persisted sessions on initial load
    });
    listeners.push(unsub);
  }

  // Highlight env cards on hover
  document.querySelectorAll('.cc-env-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--border-glow)';
      card.style.boxShadow = '0 4px 20px var(--glow-orange)';
      card.style.transform = 'translateY(-2px)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border-color)';
      card.style.boxShadow = 'none';
      card.style.transform = 'translateY(0)';
    });
  });

  updateStats();
}

export function destroy() {
  listeners.forEach(u => u());
  listeners = [];
  sessions = [];
  delete window.cloudView;
}

function updateStats() {
  const activeEl = document.getElementById('cc-active');
  const hoursEl = document.getElementById('cc-total-hours');
  const cpuEl = document.getElementById('cc-cpu');
  const ramEl = document.getElementById('cc-ram');
  const statusDot = document.querySelector('#cc-status-indicator .status-dot');
  const statusText = document.getElementById('cc-status-text');

  const running = sessions.filter(s => s.status === 'running');

  if (activeEl) activeEl.textContent = running.length;

  if (hoursEl) {
    let totalMs = 0;
    running.forEach(s => { totalMs += (Date.now() - new Date(s.startedAt).getTime()); });
    const totalHours = (totalMs / 3600000).toFixed(1);
    hoursEl.textContent = `${totalHours}h`;
  }

  if (cpuEl) {
    const avgCpu = running.length > 0 ? Math.round(running.reduce((sum, s) => sum + s.cpuUsage, 0) / running.length) : 0;
    cpuEl.textContent = `${avgCpu}%`;
  }

  if (ramEl) {
    const avgRam = running.length > 0 ? Math.round(running.reduce((sum, s) => sum + s.ramUsage, 0) / running.length) : 0;
    ramEl.textContent = `${avgRam}%`;
  }

  if (statusDot) {
    statusDot.className = `status-dot ${running.length > 0 ? 'active' : 'idle'}`;
  }
  if (statusText) {
    statusText.textContent = running.length > 0 ? `${running.length} active session${running.length > 1 ? 's' : ''}` : 'No active sessions';
  }
}

function getElapsedTime(startTime) {
  const ms = Date.now() - new Date(startTime).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function renderSessions() {
  const container = document.getElementById('cc-sessions');
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem;">
        <p style="font-size: 0.9rem; color: var(--text-muted);">No active sessions. Launch an environment above to get started.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map(s => {
    const statusMap = {
      'starting': { label: 'Starting...', dot: 'thinking', color: 'var(--badge-amber)' },
      'running': { label: 'Running', dot: 'active', color: 'var(--badge-teal)' },
      'stopping': { label: 'Stopping...', dot: 'reflecting', color: 'var(--badge-coral)' },
      'restarting': { label: 'Restarting...', dot: 'thinking', color: 'var(--badge-amber)' }
    };
    const st = statusMap[s.status] || statusMap['running'];

    return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem; border-bottom: 1px solid var(--border-subtle); transition: background 0.15s ease;">
        <div style="display: flex; align-items: center; gap: 1rem; min-width: 0;">
          <div style="font-size: 1.5rem; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); border-radius: var(--radius-sm);">${s.envIcon}</div>
          <div style="min-width: 0;">
            <div style="font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;">
              ${s.envName}
              <span class="status-dot ${st.dot}"></span>
              <span style="font-size: 0.75rem; color: ${st.color};">${st.label}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 1rem; margin-top: 0.25rem;">
              <span>ID: ${s.sessionId.substring(0, 8)}</span>
              <span>⏱ ${getElapsedTime(s.startedAt)}</span>
              <span>CPU: ${s.cpuUsage}%</span>
              <span>RAM: ${s.ramUsage}%</span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
          ${s.status === 'running' ? `
            <button class="btn btn-ghost btn-sm" onclick="window.cloudView.restartSession('${s.sessionId}')">↻ Restart</button>
            <button class="btn btn-danger btn-sm" onclick="window.cloudView.stopSession('${s.sessionId}')">■ Stop</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function addLog(message) {
  const logsEl = document.getElementById('cc-logs');
  if (!logsEl) return;

  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.style.animation = 'fadeIn 0.3s ease';

  const isSuccess = message.includes('✓');
  const isError = message.includes('✗') || message.includes('Error');
  const color = isSuccess ? 'var(--badge-teal)' : isError ? 'var(--badge-coral)' : 'var(--text-secondary)';

  line.innerHTML = `<span style="color: var(--text-muted);">[${time}]</span> <span style="color: ${color};">${message}</span>`;

  // Remove placeholder
  const placeholder = logsEl.querySelector('div[style*="text-muted"]');
  if (placeholder && placeholder.textContent.includes('Waiting')) {
    logsEl.innerHTML = '';
  }

  logsEl.appendChild(line);
  logsEl.scrollTop = logsEl.scrollHeight;
}
