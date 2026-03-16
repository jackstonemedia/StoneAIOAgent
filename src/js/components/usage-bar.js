import { getUsage } from '../api.js';
import { getCurrentUser } from '../app.js';

let usagePollingInterval = null;

export function initUsageBar() {
    const container = document.getElementById('usage-bar-container');
    // Only inject if there's a reserved container in the DOM layout
    // Assuming a standard auth layout might have a generic sidebar footer.
    // We'll append it to nav if explicit container isn't found.
    let target = container || document.querySelector('nav');

    if (!target) return; // Not ready or not applicable in this view

    // Make sure we inject the actual usage UI element if it doesn't exist
    let usageElement = document.getElementById('global-usage-bar');
    if (!usageElement) {
        usageElement = document.createElement('div');
        usageElement.id = 'global-usage-bar';
        usageElement.style.padding = '1rem';
        usageElement.style.borderTop = '1px solid var(--border-color)';
        usageElement.style.marginTop = 'auto'; // push to bottom in flex column
        target.appendChild(usageElement);
    }

    fetchAndRenderUsage();

    if (usagePollingInterval) clearInterval(usagePollingInterval);
    usagePollingInterval = setInterval(fetchAndRenderUsage, 5 * 60 * 1000); // Every 5 minutes
}

export async function fetchAndRenderUsage() {
    const user = getCurrentUser();
    if (!user) return; // Do not show if not logged in

    const usageElement = document.getElementById('global-usage-bar');
    if (!usageElement) return;

    try {
        const usage = await getUsage();
        // Default structure fallback if not populated dynamically
        const data = usage || {
            agentRunsToday: 0,
            agentRunsLimit: 200,
            evolutionsToday: 0,
            evolutionsLimit: 10
        };

        const ratio = data.agentRunsToday / data.agentRunsLimit;
        const pct = Math.min(100, (ratio * 100));

        let colorVar = '--success-color'; // Green
        if (ratio >= 0.8) colorVar = '--danger-color'; // Red
        else if (ratio >= 0.5) colorVar = '--warning-color'; // Amber

        const initial = user.displayName ? user.displayName.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : 'U');
        const nameStr = user.displayName || user.email || 'User';

        let warningHtml = '';
        if (ratio >= 1) {
            warningHtml = `
        <div style="color: var(--danger-color); font-size: 0.8rem; margin-top: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
          <span>Daily limit reached</span>
          <a href="#billing" style="color: var(--accent-purple); text-decoration: none;">Upgrade to Pro</a>
        </div>
      `;
        }

        usageElement.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--accent-purple); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: bold;">
          ${initial}
        </div>
        <span style="font-size: 0.9rem; font-weight: 500; truncate: true; overflow: hidden; text-overflow: ellipsis; max-width: 120px; white-space: nowrap;">${nameStr}</span>
      </div>
      
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
          <span>Runs today</span>
          <span>${data.agentRunsToday} / ${data.agentRunsLimit}</span>
        </div>
        <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
          <div style="height: 100%; width: ${pct}%; background: var(${colorVar}); border-radius: 3px; transition: width 0.5s ease, background-color 0.5s ease;"></div>
        </div>
        ${warningHtml}
      </div>
    `;

    } catch (err) {
        console.error("Failed to fetch usage metrics", err);
        // Silent fail on sidebar
    }
}
