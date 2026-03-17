import { db } from '../firebase.js';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { api } from '../api.js';

export async function renderVersionHistory(uid, agentId, container) {
  container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading version history...</div>';

  try {
    const versionsRef = collection(db, 'users', uid, 'agents', agentId, 'versions');
    const q = query(versionsRef, orderBy('createdAt', 'desc'), limit(10));
    const snap = await getDocs(q);

    const versions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (versions.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No version history available.</div>';
      return;
    }

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <h3 style="margin: 0; font-size: 1rem; font-weight: 600;">Version History</h3>
        <button class="btn btn-sm btn-secondary" onclick="window.versionHistory.createSnapshot('${agentId}')">Create Snapshot</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 1rem; position: relative;">
        <div style="position: absolute; top: 0; bottom: 0; left: 15px; width: 2px; background: var(--border-color); z-index: 0;"></div>
    `;

    versions.forEach((v, i) => {
      const dateStr = v.createdAt?.toDate ? new Date(v.createdAt.toDate()).toLocaleString() : 'Unknown Date';
      const score = v.averageScore || 0;
      const isLatest = i === 0;

      html += `
        <div class="card" style="position: relative; z-index: 1; margin-left: 40px; padding: 1rem; border-color: ${isLatest ? 'var(--badge-teal)' : 'var(--border-color)'};">
          <div style="position: absolute; left: -33px; top: 16px; width: 12px; height: 12px; border-radius: 50%; background: ${isLatest ? 'var(--badge-teal)' : 'var(--bg-surface)'}; border: 2px solid ${isLatest ? 'var(--bg-primary)' : 'var(--border-color)'};"></div>
          
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-weight: 600; font-size: 1rem;">Version ${v.versionId.substring(0, 8)}</span>
                ${isLatest ? '<span class="badge badge-teal">Current</span>' : ''}
              </div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">${dateStr}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="text-align: right;">
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Avg Score</div>
                <div style="font-weight: 600; color: var(--text-primary); font-family: var(--font-mono);">${score.toFixed(1)}</div>
              </div>
              ${!isLatest ? `<button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem;" onclick="window.versionHistory.restore('${agentId}', '${v.versionId}')">Restore</button>` : ''}
            </div>
          </div>

          <div style="margin-top: 1rem;">
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; cursor: pointer; display: flex; align-items: center; gap: 0.5rem;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              View System Prompt Snapshot
            </div>
            <div style="display: none; padding: 0.75rem; background: #000; border-radius: 4px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary); white-space: pre-wrap; border: 1px solid var(--border-color); margin-top: 0.5rem;">${escapeHtml((v.systemPrompt || '').substring(0, 150))}...</div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

  } catch (err) {
    console.error("Failed to load version history:", err);
    container.innerHTML = `<div style="color: var(--badge-coral); padding: 1rem;">Error loading version history. Check console.</div>`;
  }

  window.versionHistory = {
    restore: async (aId, vId) => {
      if (!confirm('Are you sure you want to restore this version? This will overwrite the current system prompt and strategies.')) return;
      try {
        if (window.showToast) window.showToast('Restoring version...', 'info');
        await api.rollbackAgent({ agentId: aId, versionId: vId });
        if (window.showToast) window.showToast('Version restored successfully.', 'success');
        // Reload page or re-render agent view
        if (window.agentsView && window.agentsView.openDetail) {
          window.agentsView.openDetail(aId);
        }
      } catch (e) {
        console.error(e);
        if (window.showToast) window.showToast('Failed to restore version.', 'error');
      }
    },
    createSnapshot: async (aId) => {
      try {
        if (window.showToast) window.showToast('Creating snapshot...', 'info');
        await api.snapshotAgentVersion({ agentId: aId });
        if (window.showToast) window.showToast('Snapshot created.', 'success');
        renderVersionHistory(uid, agentId, container);
      } catch (e) {
        console.error(e);
        if (window.showToast) window.showToast('Failed to create snapshot.', 'error');
      }
    }
  };
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
