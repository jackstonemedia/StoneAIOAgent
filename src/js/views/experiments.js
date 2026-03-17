import { db, auth } from '../firebase.js';
import { collection, query, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { api } from '../api.js';

let unsubscribe = null;

export async function render() {
  return `
    <div class="card" style="margin-bottom: 2rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0 0 0.5rem 0;">Experiments</h2>
          <p style="margin: 0; color: var(--text-secondary);">Run A/B tests on your agent strategies to scientifically improve performance.</p>
        </div>
        <button class="btn btn-primary" onclick="window.experimentsView.openNewExperimentModal()">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          New Experiment
        </button>
      </div>
    </div>

    <div id="suggested-experiments-container"></div>

    <div class="card">
      <h3 style="margin-top: 0; margin-bottom: 1.5rem;">Active & Past Experiments</h3>
      <div style="overflow-x: auto;">
        <table class="run-table" style="width: 100%;">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Name</th>
              <th>Status</th>
              <th>Variant A</th>
              <th>Variant B</th>
              <th>Progress</th>
              <th>Winner</th>
            </tr>
          </thead>
          <tbody id="experiments-table-body">
            <tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading experiments...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- New Experiment Modal -->
    <div id="new-experiment-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; align-items: center; justify-content: center;">
      <div class="card" style="width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; position: relative;">
        <button class="btn btn-ghost" style="position: absolute; top: 1rem; right: 1rem;" onclick="document.getElementById('new-experiment-modal').style.display='none'">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <h3 style="margin-top: 0; margin-bottom: 1.5rem;">Create New Experiment</h3>
        
        <div class="form-group">
          <label class="form-label">Target Agent</label>
          <select id="exp-agent" class="form-control"></select>
        </div>
        
        <div class="form-group">
          <label class="form-label">Experiment Name</label>
          <input type="text" id="exp-name" class="form-control" placeholder="e.g., Tone test: Professional vs Casual">
        </div>

        <div class="form-group">
          <label class="form-label">Hypothesis</label>
          <textarea id="exp-hypothesis" class="form-control" rows="2" placeholder="e.g., A more casual tone will result in higher user engagement scores."></textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
          <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: rgba(255,255,255,0.02);">
            <h4 style="margin-top: 0; margin-bottom: 0.5rem; color: var(--badge-teal);">Variant A</h4>
            <div class="form-group">
              <label class="form-label">Description</label>
              <input type="text" id="exp-desc-a" class="form-control" placeholder="Professional tone">
            </div>
            <div class="form-group">
              <label class="form-label">Prompt Snippet (Appended)</label>
              <textarea id="exp-prompt-a" class="form-control" rows="3" placeholder="Maintain a strictly professional and formal tone at all times."></textarea>
            </div>
          </div>
          
          <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: rgba(255,255,255,0.02);">
            <h4 style="margin-top: 0; margin-bottom: 0.5rem; color: var(--badge-amber);">Variant B</h4>
            <div class="form-group">
              <label class="form-label">Description</label>
              <input type="text" id="exp-desc-b" class="form-control" placeholder="Casual tone">
            </div>
            <div class="form-group">
              <label class="form-label">Prompt Snippet (Appended)</label>
              <textarea id="exp-prompt-b" class="form-control" rows="3" placeholder="Use a casual, friendly, and conversational tone. Use emojis occasionally."></textarea>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Target Runs Per Variant</label>
          <input type="number" id="exp-target-runs" class="form-control" value="30" min="5" max="100">
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">Minimum runs required before checking for statistical significance.</div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem;">
          <button class="btn btn-secondary" onclick="document.getElementById('new-experiment-modal').style.display='none'">Cancel</button>
          <button class="btn btn-primary" id="btn-create-exp" onclick="window.experimentsView.submitExperiment()">Start Experiment</button>
        </div>
      </div>
    </div>
  `;
}

export async function init() {
  const user = auth.currentUser;
  if (!user) return;

  loadAgentsForDropdown(user.uid);
  setupExperimentsListener(user.uid);

  window.experimentsView = {
    openNewExperimentModal: (prefillAgentId = null) => {
      document.getElementById('exp-name').value = '';
      document.getElementById('exp-hypothesis').value = '';
      document.getElementById('exp-desc-a').value = '';
      document.getElementById('exp-prompt-a').value = '';
      document.getElementById('exp-desc-b').value = '';
      document.getElementById('exp-prompt-b').value = '';
      document.getElementById('exp-target-runs').value = '30';

      if (prefillAgentId) {
        document.getElementById('exp-agent').value = prefillAgentId;
      }

      document.getElementById('new-experiment-modal').style.display = 'flex';
    },
    submitExperiment: async () => {
      const agentId = document.getElementById('exp-agent').value;
      const name = document.getElementById('exp-name').value;
      const hypothesis = document.getElementById('exp-hypothesis').value;
      const variantADescription = document.getElementById('exp-desc-a').value;
      const variantAPromptSnippet = document.getElementById('exp-prompt-a').value;
      const variantBDescription = document.getElementById('exp-desc-b').value;
      const variantBPromptSnippet = document.getElementById('exp-prompt-b').value;
      const targetRunsPerVariant = parseInt(document.getElementById('exp-target-runs').value, 10);

      if (!agentId || !name || !hypothesis || !variantADescription || !variantBDescription || !variantAPromptSnippet || !variantBPromptSnippet || !targetRunsPerVariant) {
        if (window.showToast) window.showToast('Please fill in all fields.', 'warning');
        return;
      }

      const btn = document.getElementById('btn-create-exp');
      btn.disabled = true;
      btn.textContent = 'Starting...';

      try {
        await api.createExperiment({
          agentId, name, hypothesis, variantADescription, variantBDescription, variantAPromptSnippet, variantBPromptSnippet, targetRunsPerVariant
        });
        if (window.showToast) window.showToast('Experiment started successfully!', 'success');
        document.getElementById('new-experiment-modal').style.display = 'none';
      } catch (err) {
        console.error(err);
        if (window.showToast) window.showToast('Failed to start experiment.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Start Experiment';
      }
    },
    toggleDetail: (expId) => {
      const row = document.getElementById(`exp-detail-${expId}`);
      if (row) {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
      }
    },
    checkSignificance: async (expId) => {
      try {
        if (window.showToast) window.showToast('Checking significance...', 'info');
        const res = await api.checkExperimentSignificance({ experimentId: expId });
        if (res.data.significant) {
          if (window.showToast) window.showToast(`Experiment concluded! Variant ${res.data.winnerId} won.`, 'success');
        } else {
          if (window.showToast) window.showToast('Not statistically significant yet.', 'warning');
        }
      } catch (e) {
        console.error(e);
        if (window.showToast) window.showToast('Failed to check significance.', 'error');
      }
    }
  };
}

export function destroy() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (window.experimentsView) {
    delete window.experimentsView;
  }
}

async function loadAgentsForDropdown(uid) {
  try {
    const agentsRef = collection(db, 'users', uid, 'agents');
    const snap = await getDocs(agentsRef);
    const select = document.getElementById('exp-agent');
    if (!select) return;

    select.innerHTML = snap.docs.map(d => `<option value="${d.id}">${escapeHtml(d.data().name)}</option>`).join('');

    // Check for suggested experiments
    const suggested = snap.docs.filter(d => d.data().suggestExperiment);
    const bannerContainer = document.getElementById('suggested-experiments-container');
    if (bannerContainer && suggested.length > 0) {
      bannerContainer.innerHTML = suggested.map(d => `
        <div class="card" style="margin-bottom: 1.5rem; border-color: var(--badge-amber); background: rgba(245, 158, 11, 0.05);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 1rem; align-items: center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--badge-amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><circle cx="12" cy="15" r="2"/></svg>
              <div>
                <h4 style="margin: 0 0 0.25rem 0; color: var(--badge-amber);">Experiment Suggested</h4>
                <p style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">Agent <strong>${escapeHtml(d.data().name)}</strong> has plateaued. Consider running an experiment to find a better system prompt.</p>
              </div>
            </div>
            <button class="btn btn-sm" style="background: var(--badge-amber); color: #000; font-weight: 600;" onclick="window.experimentsView.openNewExperimentModal('${d.id}')">Create Experiment</button>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error("Failed to load agents for dropdown", e);
  }
}

function setupExperimentsListener(uid) {
  const expRef = collection(db, 'users', uid, 'experiments');
  const q = query(expRef, orderBy('createdAt', 'desc'));

  unsubscribe = onSnapshot(q, (snap) => {
    const tbody = document.getElementById('experiments-table-body');
    if (!tbody) return;

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No experiments found.</td></tr>';
      return;
    }

    tbody.innerHTML = snap.docs.map(docSnap => {
      const exp = { id: docSnap.id, ...docSnap.data() };

      let statusHtml = '';
      if (exp.status === 'active') {
        statusHtml = `<div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 8px; height: 8px; border-radius: 50%; background: var(--badge-blue); box-shadow: 0 0 8px var(--badge-blue);"></div> Active</div>`;
      } else if (exp.status === 'completed') {
        statusHtml = `<div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 8px; height: 8px; border-radius: 50%; background: var(--badge-teal);"></div> Completed</div>`;
      } else {
        statusHtml = `<div style="display: flex; align-items: center; gap: 0.5rem;"><div style="width: 8px; height: 8px; border-radius: 50%; background: var(--text-secondary);"></div> Paused</div>`;
      }

      const meanA = exp.scoresA && exp.scoresA.length > 0 ? (exp.scoresA.reduce((a, b) => a + b, 0) / exp.scoresA.length).toFixed(1) : '-';
      const meanB = exp.scoresB && exp.scoresB.length > 0 ? (exp.scoresB.reduce((a, b) => a + b, 0) / exp.scoresB.length).toFixed(1) : '-';

      const progressA = Math.min(100, Math.round(((exp.currentRunsA || 0) / exp.targetRunsPerVariant) * 100));
      const progressB = Math.min(100, Math.round(((exp.currentRunsB || 0) / exp.targetRunsPerVariant) * 100));
      const overallProgress = Math.round((progressA + progressB) / 2);

      let winnerHtml = '-';
      if (exp.winnerId) {
        winnerHtml = `<span class="badge" style="background: transparent; border-color: ${exp.winnerId === 'A' ? 'var(--badge-teal)' : 'var(--badge-amber)'}; color: ${exp.winnerId === 'A' ? 'var(--badge-teal)' : 'var(--badge-amber)'};">Variant ${exp.winnerId}</span>`;
      }

      // Mini histograms
      const renderHistogram = (scores, color) => {
        if (!scores || scores.length === 0) return '<div style="height: 40px; display: flex; align-items: flex-end; color: var(--text-secondary); font-size: 0.75rem;">No data</div>';
        const buckets = new Array(10).fill(0);
        scores.forEach(s => {
          const idx = Math.min(9, Math.floor(s / 10));
          buckets[idx]++;
        });
        const max = Math.max(...buckets, 1);
        return `
          <div style="display: flex; align-items: flex-end; gap: 2px; height: 40px; margin-top: 0.5rem;">
            ${buckets.map(b => `<div style="flex: 1; background: ${color}; opacity: ${b / max || 0.1}; height: ${Math.max(5, (b / max) * 100)}%; border-radius: 2px 2px 0 0;"></div>`).join('')}
          </div>
        `;
      };

      return `
        <tr style="cursor: pointer;" onclick="window.experimentsView.toggleDetail('${exp.id}')">
          <td style="font-weight: 500;">${escapeHtml(exp.agentName)}</td>
          <td>${escapeHtml(exp.name)}</td>
          <td>${statusHtml}</td>
          <td style="font-family: var(--font-mono); color: var(--badge-teal);">${meanA}</td>
          <td style="font-family: var(--font-mono); color: var(--badge-amber);">${meanB}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <div style="flex: 1; height: 4px; background: var(--bg-surface); border-radius: 2px; overflow: hidden;">
                <div style="height: 100%; width: ${overallProgress}%; background: var(--text-primary);"></div>
              </div>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">${overallProgress}%</span>
            </div>
          </td>
          <td>${winnerHtml}</td>
        </tr>
        <tr id="exp-detail-${exp.id}" style="display: none; background: rgba(0,0,0,0.2);">
          <td colspan="7" style="padding: 1.5rem; border-bottom: 1px solid var(--border-color);">
            <div style="margin-bottom: 1.5rem;">
              <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Hypothesis</div>
              <div style="font-style: italic; color: var(--text-primary);">"${escapeHtml(exp.hypothesis)}"</div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
              <div class="card" style="border-color: var(--badge-teal); background: rgba(45, 212, 191, 0.02);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <h4 style="margin: 0 0 0.25rem 0; color: var(--badge-teal);">Variant A</h4>
                    <div style="font-size: 0.875rem; color: var(--text-secondary);">${escapeHtml(exp.variantA?.description || '')}</div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 1.5rem; font-weight: 600; font-family: var(--font-mono); color: var(--badge-teal);">${meanA}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${exp.currentRunsA || 0} / ${exp.targetRunsPerVariant} runs</div>
                  </div>
                </div>
                ${renderHistogram(exp.scoresA, 'var(--badge-teal)')}
              </div>
              
              <div class="card" style="border-color: var(--badge-amber); background: rgba(245, 158, 11, 0.02);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <h4 style="margin: 0 0 0.25rem 0; color: var(--badge-amber);">Variant B</h4>
                    <div style="font-size: 0.875rem; color: var(--text-secondary);">${escapeHtml(exp.variantB?.description || '')}</div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 1.5rem; font-weight: 600; font-family: var(--font-mono); color: var(--badge-amber);">${meanB}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${exp.currentRunsB || 0} / ${exp.targetRunsPerVariant} runs</div>
                  </div>
                </div>
                ${renderHistogram(exp.scoresB, 'var(--badge-amber)')}
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.05);">
              <div style="font-size: 0.875rem; color: var(--text-secondary);">
                ${exp.status === 'completed'
          ? `Statistical significance reached (t-stat: ${exp.tStat?.toFixed(2)}). Variant ${exp.winnerId} outperformed.`
          : `Waiting for more data to determine statistical significance.`}
              </div>
              <div style="display: flex; gap: 0.5rem;">
                ${exp.status === 'active' ? `<button class="btn btn-sm btn-secondary" onclick="window.experimentsView.checkSignificance('${exp.id}')">Check Significance Now</button>` : ''}
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }, (error) => {
    console.error("Error listening to experiments:", error);
  });
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
