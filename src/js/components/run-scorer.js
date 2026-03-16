export function renderRunScorer(runId, agentId) {
  return `
    <div class="run-scorer card" id="scorer-${runId}" style="margin-top: 1rem; background: rgba(0,0,0,0.2); border-color: var(--border-color);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <h4 style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">Rate this output</h4>
        <div class="star-rating" id="stars-${runId}">
          <span class="star" data-val="1" onclick="window.runScorer.setRating('${runId}', 1)">★</span>
          <span class="star" data-val="2" onclick="window.runScorer.setRating('${runId}', 2)">★</span>
          <span class="star" data-val="3" onclick="window.runScorer.setRating('${runId}', 3)">★</span>
          <span class="star" data-val="4" onclick="window.runScorer.setRating('${runId}', 4)">★</span>
          <span class="star" data-val="5" onclick="window.runScorer.setRating('${runId}', 5)">★</span>
        </div>
      </div>
      
      <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
        <div style="flex: 1;">
          <textarea id="note-${runId}" class="form-control" placeholder="Add a note about why it performed this way (optional)..." style="min-height: 60px; font-size: 0.875rem;"></textarea>
        </div>
        <div style="width: 120px;">
          <label style="font-size: 0.75rem; color: var(--text-secondary); display: block; margin-bottom: 0.25rem;">Primary Score (0-100)</label>
          <input type="number" id="score-${runId}" class="form-control" min="0" max="100" placeholder="e.g. 85" style="font-size: 0.875rem;">
        </div>
      </div>
      
      <div style="display: flex; justify-content: flex-end;">
        <button class="btn btn-primary btn-sm" id="btn-submit-${runId}" onclick="window.runScorer.submitScore('${runId}', '${agentId}')">Submit Score</button>
      </div>
    </div>
  `;
}

export function init() {
  window.runScorer = {
    ratings: {},
    setRating: (runId, val) => {
      window.runScorer.ratings[runId] = val;
      const stars = document.querySelectorAll(`#stars-${runId} .star`);
      stars.forEach(s => {
        if (parseInt(s.dataset.val) <= val) {
          s.style.color = 'var(--badge-amber)';
        } else {
          s.style.color = 'var(--text-secondary)';
        }
      });
    },
    submitScore: async (runId, agentId) => {
      const scoreInput = document.getElementById(`score-${runId}`).value;
      const noteInput = document.getElementById(`note-${runId}`).value;
      const rating = window.runScorer.ratings[runId] || null;

      const primaryScore = parseInt(scoreInput);
      if (isNaN(primaryScore) || primaryScore < 0 || primaryScore > 100) {
        alert("Please enter a valid primary score between 0 and 100.");
        return;
      }

      const btn = document.getElementById(`btn-submit-${runId}`);
      const originalText = btn.textContent;
      btn.textContent = "Submitting...";
      btn.disabled = true;

      try {
        const { scoreRun } = await import('../api.js');

        const result = await scoreRun(agentId, runId, primaryScore, { rating }, rating, noteInput);

        const { weightedScore, savedToLibrary, suggestExperiment } = result;

        // Update UI
        const scorerDiv = document.getElementById(`scorer-${runId}`);
        scorerDiv.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--badge-teal); font-size: 0.875rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            Score submitted: ${weightedScore.toFixed(1)}
            ${savedToLibrary ? '<span class="badge badge-purple" style="margin-left: 0.5rem;">Saved to Library</span>' : ''}
          </div>
        `;

        // Update the row badge if we can find it
        const rowBadge = document.getElementById(`badge-${runId}`);
        if (rowBadge) {
          let scoreColor = 'var(--badge-coral)';
          if (weightedScore >= 75) scoreColor = 'var(--badge-teal)';
          else if (weightedScore >= 50) scoreColor = 'var(--badge-amber)';

          rowBadge.style.borderColor = scoreColor;
          rowBadge.style.color = scoreColor;
          rowBadge.textContent = weightedScore.toFixed(1);
        }

        // Show toast
        const container = document.getElementById('toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--badge-teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <span>Score successfully recorded.</span>
        `;
        container.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 3000);

      } catch (err) {
        console.error("Failed to submit score:", err);
        alert("Failed to submit score. Check console.");
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  };
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
  return container;
}
