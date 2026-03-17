import { db } from '../firebase.js';
import { collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { api } from '../api.js';

let currentAgentId = null;
let currentUid = null;
let currentAgent = null;

export async function renderLearningView(uid, agentId, container) {
  currentUid = uid;
  currentAgentId = agentId;

  const agentRef = doc(db, 'users', uid, 'agents', agentId);
  const agentSnap = await getDoc(agentRef);
  if (!agentSnap.exists()) return;
  currentAgent = agentSnap.data();

  container.innerHTML = `
    <div class="learning-tabs" style="display: flex; gap: 1rem; border-bottom: 1px solid var(--border-color); margin-bottom: 1.5rem; padding-bottom: 0.5rem;">
      <button class="btn btn-sm learning-tab-btn active" data-tab="performance" style="background: transparent; border: none; color: var(--text-primary); font-weight: 600; padding: 0.5rem 1rem; border-bottom: 2px solid var(--badge-purple);">Performance</button>
      <button class="btn btn-sm learning-tab-btn" data-tab="strategies" style="background: transparent; border: none; color: var(--text-secondary); padding: 0.5rem 1rem;">Strategies</button>
      <button class="btn btn-sm learning-tab-btn" data-tab="examples" style="background: transparent; border: none; color: var(--text-secondary); padding: 0.5rem 1rem;">Examples</button>
      <button class="btn btn-sm learning-tab-btn" data-tab="reflections" style="background: transparent; border: none; color: var(--text-secondary); padding: 0.5rem 1rem;">Reflections</button>
    </div>
    <div id="learning-content" style="min-height: 400px;">
      <!-- Content loads here -->
    </div>
  `;

  const tabBtns = container.querySelectorAll('.learning-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.style.color = 'var(--text-secondary)';
        b.style.borderBottom = 'none';
        b.style.fontWeight = 'normal';
      });
      btn.classList.add('active');
      btn.style.color = 'var(--text-primary)';
      btn.style.borderBottom = '2px solid var(--badge-purple)';
      btn.style.fontWeight = '600';

      loadTab(btn.dataset.tab);
    });
  });

  // Expose globally for notifications
  window.learningView = {
    switchLearningTab: (tabName) => {
      const btn = container.querySelector(`.learning-tab-btn[data-tab="${tabName}"]`);
      if (btn) btn.click();
    }
  };

  loadTab('performance');
}

async function loadTab(tabName) {
  const content = document.getElementById('learning-content');
  content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading...</div>';

  try {
    if (tabName === 'performance') await renderPerformance(content);
    else if (tabName === 'strategies') await renderStrategies(content);
    else if (tabName === 'examples') await renderExamples(content);
    else if (tabName === 'reflections') await renderReflections(content);
  } catch (err) {
    console.error(`Failed to load tab ${tabName}:`, err);
    content.innerHTML = `<div style="color: var(--badge-coral); padding: 1rem;">Error loading ${tabName}. Check console.</div>`;
  }
}

// ============================================================================
// PERFORMANCE TAB
// ============================================================================

async function renderPerformance(container) {
  const runsRef = collection(db, 'users', currentUid, 'agents', currentAgentId, 'runs');
  const q = query(runsRef, where('primaryScore', '!=', null), orderBy('primaryScore'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  let runs = snap.docs.map(d => d.data());
  runs.sort((a, b) => {
    const ta = a.createdAt ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt ? b.createdAt.toMillis() : 0;
    return ta - tb; // ascending
  });

  // Take last 50
  runs = runs.slice(-50);

  let bestScore = 0;
  let totalScoreLast10 = 0;
  let countLast10 = 0;

  runs.forEach((r, i) => {
    const s = r.weightedScore || r.primaryScore || 0;
    if (s > bestScore) bestScore = s;
    if (i >= runs.length - 10) {
      totalScoreLast10 += s;
      countLast10++;
    }
  });

  const avgLast10 = countLast10 > 0 ? (totalScoreLast10 / countLast10).toFixed(1) : '-';
  const totalRuns = currentAgent.totalRuns || 0;

  let html = '';

  if (currentAgent.proposedSystemPrompt) {
    html += `
      <div class="card" style="background: rgba(234, 179, 8, 0.1); border-color: var(--badge-amber); margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--badge-amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          <div>
            <h4 style="margin: 0; color: var(--badge-amber); font-size: 0.875rem;">Your agent has a pending instruction update</h4>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">The prompt evolution engine has proposed improvements based on recent performance patterns.</div>
          </div>
        </div>
        <button class="btn btn-sm" style="background: var(--badge-amber); color: #000; font-weight: 600;" onclick="window.learningView.reviewPromptDiff()">Review & Approve</button>
      </div>
    `;
  }

  html += `
    <div class="card" style="margin-bottom: 1.5rem; padding: 1.5rem;">
      <h3 style="margin-top: 0; margin-bottom: 1rem; font-size: 1rem; font-weight: 600;">Performance History (Last 50 Scored Runs)</h3>
      <div style="position: relative; width: 100%; height: 240px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid var(--border-color);">
        <canvas id="performance-chart" style="width: 100%; height: 100%; display: block;"></canvas>
        <div id="chart-tooltip" style="position: absolute; display: none; background: var(--bg-surface); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; font-size: 0.75rem; color: var(--text-primary); pointer-events: none; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.5); white-space: nowrap;"></div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1.5rem;">
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Best Score</div>
          <div style="font-size: 1.5rem; font-weight: 600; font-family: var(--font-mono); color: var(--badge-teal);">${bestScore.toFixed(1)}</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Average (Last 10)</div>
          <div style="font-size: 1.5rem; font-weight: 600; font-family: var(--font-mono); color: var(--text-primary);">${avgLast10}</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Total Runs</div>
          <div style="font-size: 1.5rem; font-weight: 600; font-family: var(--font-mono); color: var(--text-primary);">${totalRuns}</div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Draw chart
  const canvas = document.getElementById('performance-chart');
  if (canvas && runs.length > 0) {
    drawChart(canvas, runs, currentAgent.averageScore || 0);
  } else if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'var(--text-secondary)';
    ctx.font = '12px var(--font-sans)';
    ctx.textAlign = 'center';
    ctx.fillText('No scored runs yet.', canvas.width / 2, canvas.height / 2);
  }

  // Attach modal logic
  window.learningView.reviewPromptDiff = () => {
    showDiffModal(currentAgent.systemPrompt || '', currentAgent.proposedSystemPrompt || '');
  };
}

function drawChart(canvas, runs, avgScore) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = canvas.width - padding.left - padding.right;
  const height = canvas.height - padding.top - padding.bottom;

  // Draw grid
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.fillStyle = 'var(--text-secondary)';
  ctx.font = '10px var(--font-sans)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  [0, 25, 50, 75, 100].forEach(val => {
    const y = padding.top + height - (val / 100) * height;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(canvas.width - padding.right, y);
    ctx.stroke();
    ctx.fillText(val.toString(), padding.left - 8, y);
  });

  // Draw avg line
  if (avgScore > 0) {
    const y = padding.top + height - (avgScore / 100) * height;
    ctx.strokeStyle = 'var(--badge-purple)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(canvas.width - padding.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'var(--badge-purple)';
    ctx.fillText('AVG', padding.left - 8, y - 10);
  }

  // Calculate points
  const points = runs.map((r, i) => {
    const score = r.weightedScore || r.primaryScore || 0;
    const x = padding.left + (i / Math.max(1, runs.length - 1)) * width;
    const y = padding.top + height - (score / 100) * height;
    return { x, y, score, run: r, index: i + 1 };
  });

  // Animate line
  let progress = 0;
  const animate = () => {
    progress += 0.05;
    if (progress > 1) progress = 1;

    // Clear and redraw grid
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Redraw grid (simplified for animation)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'var(--text-secondary)';
    [0, 25, 50, 75, 100].forEach(val => {
      const y = padding.top + height - (val / 100) * height;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(canvas.width - padding.right, y); ctx.stroke();
      ctx.fillText(val.toString(), padding.left - 8, y);
    });
    if (avgScore > 0) {
      const y = padding.top + height - (avgScore / 100) * height;
      ctx.strokeStyle = 'var(--badge-purple)'; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(canvas.width - padding.right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = 'var(--badge-purple)'; ctx.fillText('AVG', padding.left - 8, y - 10);
    }

    // Draw lines
    const drawCount = Math.floor(progress * points.length);
    for (let i = 0; i < drawCount - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = p2.score >= p1.score ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw dots
    for (let i = 0; i < drawCount; i++) {
      const p = points[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.score >= 75 ? '#22c55e' : (p.score >= 50 ? '#f59e0b' : '#ef4444');
      ctx.fill();
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };

  requestAnimationFrame(animate);

  // Tooltip
  const tooltip = document.getElementById('chart-tooltip');
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let closest = null;
    let minDist = 20; // hover radius

    points.forEach(p => {
      const dist = Math.sqrt(Math.pow(p.x - mouseX, 2) + Math.pow(p.y - mouseY, 2));
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    });

    if (closest) {
      const dateStr = closest.run.createdAt?.toDate ? new Date(closest.run.createdAt.toDate()).toLocaleDateString() : 'Unknown';
      tooltip.innerHTML = `Run #${closest.index} &bull; Score: ${closest.score.toFixed(1)}<br>${dateStr} &bull; ${closest.run.strategyId || 'Default'}`;
      tooltip.style.left = `${closest.x + 10}px`;
      tooltip.style.top = `${closest.y - 30}px`;
      tooltip.style.display = 'block';
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
}

function showDiffModal(oldText, newText) {
  // Simple line-by-line diff
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  let diffHtml = '';
  const maxLines = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const o = oldLines[i] !== undefined ? oldLines[i] : null;
    const n = newLines[i] !== undefined ? newLines[i] : null;

    if (o === n) {
      diffHtml += `<div style="color: var(--text-secondary); padding: 2px 8px;">  ${escapeHtml(o)}</div>`;
    } else {
      if (o !== null) diffHtml += `<div style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 2px 8px;">- ${escapeHtml(o)}</div>`;
      if (n !== null) diffHtml += `<div style="background: rgba(34, 197, 94, 0.2); color: #86efac; padding: 2px 8px;">+ ${escapeHtml(n)}</div>`;
    }
  }

  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
  modal.style.background = 'rgba(0,0,0,0.8)';
  modal.style.zIndex = '10000';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';

  modal.innerHTML = `
    <div class="card" style="width: 800px; max-width: 90vw; max-height: 90vh; display: flex; flexDirection: column; background: var(--bg-primary);">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1.25rem;">Review Proposed Instructions</h3>
        <button class="btn btn-sm" onclick="this.closest('.card').parentElement.remove()" style="background: transparent; border: none; color: var(--text-secondary);">✕</button>
      </div>
      <div style="padding: 1.5rem; overflow-y: auto; flex: 1; font-family: var(--font-mono); font-size: 0.875rem; line-height: 1.5; white-space: pre-wrap; background: #000;">
        ${diffHtml}
      </div>
      <div style="padding: 1.5rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 1rem;">
        <button class="btn btn-secondary" id="btn-reject-prompt">Reject Changes</button>
        <button class="btn btn-primary" id="btn-approve-prompt">Approve & Apply</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('btn-reject-prompt').addEventListener('click', async () => {
    try {
      await updateDoc(doc(db, 'users', currentUid, 'agents', currentAgentId), { proposedSystemPrompt: null, needsPromptApproval: false });
      if (window.showToast) window.showToast('Proposed changes rejected.', 'info');
      modal.remove();
      loadTab('performance');
    } catch (e) {
      console.error(e);
      if (window.showToast) window.showToast('Failed to reject changes.', 'error');
    }
  });

  document.getElementById('btn-approve-prompt').addEventListener('click', async () => {
    try {
      await updateDoc(doc(db, 'users', currentUid, 'agents', currentAgentId), {
        systemPrompt: newText,
        proposedSystemPrompt: null,
        needsPromptApproval: false
      });
      if (window.showToast) window.showToast('System prompt updated successfully.', 'success');
      modal.remove();
      loadTab('performance');
    } catch (e) {
      console.error(e);
      if (window.showToast) window.showToast('Failed to apply changes.', 'error');
    }
  });
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================================================
// STRATEGIES TAB
// ============================================================================

async function renderStrategies(container) {
  const stratRef = collection(db, 'users', currentUid, 'agents', currentAgentId, 'strategies');
  const q = query(stratRef, orderBy('averageScore', 'desc'));
  const snap = await getDocs(q);

  const strategies = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h3 style="margin: 0; font-size: 1rem; font-weight: 600;">Active Strategies</h3>
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('add-strategy-form').style.display='block'">+ Add Strategy</button>
    </div>
    
    <div id="add-strategy-form" class="card" style="display: none; margin-bottom: 1.5rem; padding: 1.5rem; background: rgba(0,0,0,0.2);">
      <h4 style="margin-top: 0; margin-bottom: 1rem;">New Strategy</h4>
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="strat-name" class="form-control" placeholder="e.g., Aggressive Tone">
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" id="strat-desc" class="form-control" placeholder="Brief explanation">
      </div>
      <div class="form-group">
        <label>Configuration (Prompt additions or JSON)</label>
        <textarea id="strat-config" class="form-control" style="min-height: 100px; font-family: var(--font-mono);"></textarea>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 1rem;">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('add-strategy-form').style.display='none'">Cancel</button>
        <button class="btn btn-primary btn-sm" id="btn-save-strat">Save Strategy</button>
      </div>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 1rem;">
  `;

  if (strategies.length === 0) {
    html += `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No strategies defined yet.</div>`;
  } else {
    strategies.forEach((s, i) => {
      const score = s.averageScore || 0;
      const runCount = s.runCount || 0;
      let conf = 'Low';
      let confColor = 'var(--badge-coral)';
      if (runCount >= 20) { conf = 'High'; confColor = 'var(--badge-teal)'; }
      else if (runCount >= 5) { conf = 'Med'; confColor = 'var(--badge-amber)'; }

      let badgeColor = s.status === 'active' ? 'var(--badge-teal)' : 'var(--badge-gray)';

      html += `
        <div class="card" style="padding: 1rem; border-left: 4px solid ${badgeColor};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <span style="font-size: 1.25rem; font-weight: 700; color: var(--text-secondary);">#${i + 1}</span>
              <h4 style="margin: 0; font-size: 1rem;">${s.name || 'Unnamed Strategy'}</h4>
              <span class="badge" style="background: transparent; border-color: ${badgeColor}; color: ${badgeColor};">${s.status || 'active'}</span>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem;" onclick="window.learningView.boostStrat('${s.id}')">Boost</button>
              <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem;" onclick="window.learningView.editStratName('${s.id}', '${escapeHtml(s.name || '')}')">Edit Name</button>
              <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem;" onclick="window.learningView.toggleStratConfig('${s.id}')">View Config</button>
              <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem;" onclick="window.learningView.archiveStrat('${s.id}')">Archive</button>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 100px 100px; gap: 1rem; align-items: center; font-size: 0.875rem; color: var(--text-secondary);">
            <div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                <span>Avg Score</span>
                <span style="color: var(--text-primary); font-weight: 600;">${score.toFixed(1)}</span>
              </div>
              <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                <div style="width: ${score}%; height: 100%; background: var(--badge-purple);"></div>
              </div>
            </div>
            <div style="text-align: center;">
              <div style="margin-bottom: 0.25rem;">Runs</div>
              <div style="color: var(--text-primary); font-weight: 600;">${runCount}</div>
            </div>
            <div style="text-align: center;">
              <div style="margin-bottom: 0.25rem;">Confidence</div>
              <div style="color: ${confColor}; font-weight: 600;">${conf}</div>
            </div>
          </div>
          
          <div id="strat-config-${s.id}" style="display: none; margin-top: 1rem; padding: 1rem; background: #000; border-radius: 4px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); white-space: pre-wrap; border: 1px solid var(--border-color);">${escapeHtml(s.configurationSnapshot || s.description || 'No configuration')}</div>
        </div>
      `;
    });
  }

  html += `</div>`;
  container.innerHTML = html;

  window.learningView.toggleStratConfig = (id) => {
    const el = document.getElementById(`strat-config-${id}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window.learningView.archiveStrat = async (id) => {
    if (!confirm('Are you sure you want to archive this strategy?')) return;
    try {
      await updateDoc(doc(db, 'users', currentUid, 'agents', currentAgentId, 'strategies', id), { status: 'archived' });
      if (window.showToast) window.showToast('Strategy archived', 'success');
      loadTab('strategies');
    } catch (e) {
      console.error(e);
      if (window.showToast) window.showToast('Failed to archive strategy', 'error');
    }
  };

  window.learningView.boostStrat = (id) => {
    if (window.showToast) window.showToast('Strategy boosted! It will be prioritized in the next runs.', 'success');
  };

  window.learningView.editStratName = async (id, currentName) => {
    const newName = prompt('Enter new strategy name:', currentName);
    if (!newName || newName === currentName) return;
    try {
      await updateDoc(doc(db, 'users', currentUid, 'agents', currentAgentId, 'strategies', id), { name: newName });
      if (window.showToast) window.showToast('Strategy name updated', 'success');
      loadTab('strategies');
    } catch (e) {
      console.error(e);
      if (window.showToast) window.showToast('Failed to update strategy name', 'error');
    }
  };

  const saveBtn = document.getElementById('btn-save-strat');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('strat-name').value;
      const desc = document.getElementById('strat-desc').value;
      const config = document.getElementById('strat-config').value;

      if (!name) return alert('Name required');

      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      try {
        await collection(db, 'users', currentUid, 'agents', currentAgentId, 'strategies').add({
          name,
          description: desc,
          configurationSnapshot: config,
          status: 'active',
          source: 'manual',
          runCount: 0,
          totalScore: 0,
          averageScore: 0,
          createdAt: serverTimestamp()
        });
        if (window.showToast) window.showToast('Strategy created', 'success');
        loadTab('strategies');
      } catch (e) {
        console.error(e);
        if (window.showToast) window.showToast('Failed to create strategy', 'error');
        saveBtn.textContent = 'Save Strategy';
        saveBtn.disabled = false;
      }
    });
  }
}

// ============================================================================
// EXAMPLES TAB
// ============================================================================

async function renderExamples(container) {
  container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading examples...</div>`;

  let examples = [];
  try {
    const res = await api.getExamples({ agentId: currentAgentId, limit: 20 });
    examples = res.examples || [];
  } catch (e) {
    console.error("Failed to fetch examples:", e);
    container.innerHTML = `<div style="color: var(--badge-coral); padding: 1rem;">Failed to fetch examples from vector database.</div>`;
    return;
  }

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h3 style="margin: 0; font-size: 1rem; font-weight: 600;">High-Performing Examples</h3>
      <div style="display: flex; gap: 1rem; align-items: center;">
        <span style="font-size: 0.875rem; color: var(--text-secondary);">Top 20 by Score</span>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 1rem;">
  `;

  if (examples.length === 0) {
    html += `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No examples found. Score some runs > 80 to automatically add them here.</div>`;
  } else {
    examples.forEach(ex => {
      const score = ex.primary_score || 0;
      let scoreColor = 'var(--badge-teal)';
      if (score < 75) scoreColor = 'var(--badge-amber)';
      if (score < 50) scoreColor = 'var(--badge-coral)';

      const isPinned = (currentAgent.pinnedExampleIds || []).includes(ex.id);

      html += `
        <div class="card" style="padding: 1rem; border: 1px solid ${isPinned ? 'var(--badge-purple)' : 'var(--border-color)'};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span class="badge" style="background: transparent; border-color: ${scoreColor}; color: ${scoreColor};">${score.toFixed(1)}</span>
              <span style="font-size: 0.875rem; color: var(--text-secondary);">${ex.strategy_id || 'Default Strategy'}</span>
              ${isPinned ? '<span class="badge badge-purple">Pinned</span>' : ''}
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem;" onclick="window.learningView.useExampleAsTemplate('${ex.id}')">Use as Template</button>
              <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem;" onclick="window.learningView.toggleExample('${ex.id}')">View Full</button>
              <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem; color: var(--badge-coral);" onclick="window.learningView.deleteExample('${ex.id}')">Delete</button>
            </div>
          </div>
          
          <div style="font-size: 0.875rem; color: var(--text-primary); margin-bottom: 0.5rem;"><strong>Task:</strong> ${escapeHtml((ex.task_description || '').substring(0, 100))}...</div>
          
          <div id="example-full-${ex.id}" style="display: none; margin-top: 1rem;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; text-transform: uppercase;">Full Task</div>
            <div style="padding: 0.75rem; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 0.875rem; color: var(--text-primary); margin-bottom: 1rem; white-space: pre-wrap;">${escapeHtml(ex.task_description)}</div>
            
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; text-transform: uppercase;">Output</div>
            <div style="padding: 0.75rem; background: #000; border-radius: 4px; font-family: var(--font-mono); font-size: 0.875rem; color: var(--text-secondary); white-space: pre-wrap; border: 1px solid var(--border-color); max-height: 300px; overflow-y: auto;">${escapeHtml(ex.output_text)}</div>
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  container.innerHTML = html;

  window.learningView.toggleExample = (id) => {
    const el = document.getElementById(`example-full-${id}`);
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window.learningView.deleteExample = async (id) => {
    if (!confirm('Are you sure you want to delete this example?')) return;
    try {
      await api.deleteExample({ exampleId: id });
      if (window.showToast) window.showToast('Example deleted', 'success');
      loadTab('examples');
    } catch (e) {
      console.error(e);
      if (window.showToast) window.showToast('Failed to delete example', 'error');
    }
  };

  window.learningView.useExampleAsTemplate = (id) => {
    const ex = examples.find(e => e.id === id);
    if (!ex) return;

    // Switch to overview tab and open builder in edit mode
    // We can't directly populate the builder from here easily without modifying agents.js
    // But we can copy the task description to clipboard for now
    navigator.clipboard.writeText(ex.task_description).then(() => {
      if (window.showToast) window.showToast('Task description copied to clipboard!', 'success');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };
}

// ============================================================================
// REFLECTIONS TAB
// ============================================================================

async function renderReflections(container) {
  const refRef = collection(db, 'users', currentUid, 'agents', currentAgentId, 'reflections');
  const q = query(refRef, where('status', '==', 'pending'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  const reflections = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h3 style="margin: 0; font-size: 1rem; font-weight: 600;">Pending Reflections</h3>
      <button class="btn btn-primary btn-sm" id="btn-trigger-reflect">Trigger Self-Reflection Now</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
  `;

  if (reflections.length === 0) {
    html += `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No pending reflections. Trigger one to have the agent analyze its recent performance.</div>`;
  } else {
    reflections.forEach(ref => {
      const dateStr = ref.createdAt?.toDate ? new Date(ref.createdAt.toDate()).toLocaleString() : 'Unknown';

      let changesHtml = (ref.proposedChanges || []).map((c, i) => `
        <div class="card" style="background: rgba(0,0,0,0.2); padding: 1rem; margin-bottom: 0.5rem; border-left: 3px solid var(--badge-purple);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="badge badge-purple" style="text-transform: uppercase;">${c.changeType}</span>
              <span style="font-weight: 600; font-size: 0.875rem;">${escapeHtml(c.description)}</span>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <input type="checkbox" class="approve-change-cb" data-refid="${ref.id}" data-idx="${i}" checked style="accent-color: var(--badge-teal); width: 16px; height: 16px; cursor: pointer;">
            </div>
          </div>
          <div style="font-size: 0.8125rem; color: var(--text-secondary); font-style: italic;">Reasoning: ${escapeHtml(c.reasoning)}</div>
        </div>
      `).join('');

      html += `
        <div class="card" style="padding: 1.5rem; border-color: var(--badge-purple);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <span style="font-size: 0.75rem; color: var(--text-secondary);">${dateStr}</span>
            <button class="btn btn-sm" style="background: var(--badge-teal); color: #000; font-weight: 600;" onclick="window.learningView.applyRef('${ref.id}')">Approve Selected</button>
          </div>
          <div style="font-size: 0.875rem; color: var(--text-primary); margin-bottom: 1.5rem; line-height: 1.5; padding: 1rem; background: rgba(255,255,255,0.02); border-radius: 4px; border-left: 2px solid var(--text-secondary);">
            <strong>Performance Summary:</strong><br>
            ${escapeHtml(ref.performanceSummary)}
          </div>
          <h4 style="margin-top: 0; margin-bottom: 1rem; font-size: 0.875rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Proposed Changes</h4>
          ${changesHtml}
        </div>
      `;
    });
  }

  html += `</div>`;
  container.innerHTML = html;

  const triggerBtn = document.getElementById('btn-trigger-reflect');
  if (triggerBtn) {
    triggerBtn.addEventListener('click', async () => {
      triggerBtn.textContent = 'Reflecting...';
      triggerBtn.disabled = true;
      try {
        await api.agentSelfReflect({ agentId: currentAgentId });
        if (window.showToast) window.showToast('Reflection complete!', 'success');
        loadTab('reflections');
      } catch (e) {
        console.error(e);
        triggerBtn.textContent = 'Trigger Self-Reflection Now';
        triggerBtn.disabled = false;
      }
    });
  }

  window.learningView.applyRef = async (refId) => {
    const checkboxes = document.querySelectorAll(`.approve-change-cb[data-refid="${refId}"]`);
    const approvedChangeIds = [];
    checkboxes.forEach(cb => {
      if (cb.checked) approvedChangeIds.push(parseInt(cb.dataset.idx));
    });

    if (approvedChangeIds.length === 0) {
      // Just mark it approved with no changes
      try {
        await updateDoc(doc(db, 'users', currentUid, 'agents', currentAgentId, 'reflections', refId), { status: 'rejected' });
        loadTab('reflections');
        return;
      } catch (e) {
        console.error(e);
        return;
      }
    }

    try {
      if (window.showToast) window.showToast('Applying changes...', 'info');
      await api.applyReflection({ agentId: currentAgentId, reflectionId: refId, approvedChangeIds });
      if (window.showToast) window.showToast('Changes applied successfully!', 'success');
      loadTab('reflections');
    } catch (e) {
      console.error(e);
    }
  };
}
