const routes = {
  'dashboard': { title: 'Dashboard', module: () => import('./views/dashboard.js') },
  'agents': { title: 'My Agents', module: () => import('./views/agents.js') },
  'team': { title: 'Team View', module: () => import('./views/team-view.js') },
  'learning': { title: 'Learning', module: () => import('./views/learning.js') },
  'experiments': { title: 'Experiments', module: () => import('./views/experiments.js') },
  'marketplace': { title: 'Marketplace', module: () => import('./views/marketplace-view.js') }
};

export async function initRouter() {
  window.addEventListener('hashchange', handleRoute);

  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#dashboard';
  } else {
    handleRoute();
  }
}

let currentViewModule = null;
const moduleCache = {};

async function handleRoute() {
  const hash = window.location.hash.substring(1) || 'dashboard';
  const route = routes[hash];

  if (!route) {
    window.location.hash = '#dashboard';
    return;
  }

  if (currentViewModule && currentViewModule.destroy) {
    currentViewModule.destroy();
  }

  const pageTitleEl = document.getElementById('topbar-page-title');
  if (pageTitleEl) {
    pageTitleEl.textContent = route.title;
  }

  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === `#${hash}`) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  const contentEl = document.getElementById('app-content');
  contentEl.innerHTML = '<div class="loading-spinner">Loading...</div>';

  try {
    let viewModule;
    if (moduleCache[hash]) {
      viewModule = moduleCache[hash];
    } else {
      viewModule = await route.module();
      moduleCache[hash] = viewModule;
    }

    currentViewModule = viewModule;

    if (viewModule && viewModule.render) {
      try {
        contentEl.innerHTML = await viewModule.render();
        if (viewModule.init) {
          await viewModule.init();
        }
      } catch (renderError) {
        console.error(`Error rendering view ${hash}:`, renderError);
        contentEl.innerHTML = `
          <div class="card" style="border-color: var(--badge-coral); text-align: center; padding: 4rem 2rem; margin-top: 2rem;">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--badge-coral)" stroke-width="2" style="margin-bottom: 1.5rem; opacity: 0.8;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <h2 style="color: var(--badge-coral); margin-bottom: 1rem;">Something went wrong loading this view.</h2>
            <p style="color: var(--text-secondary); margin-bottom: 2rem;">We've logged the error and are looking into it.</p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
              <button class="btn btn-primary" onclick="window.location.reload()">Retry</button>
              <button class="btn btn-secondary" onclick="window.location.hash='#dashboard'">Go to Dashboard</button>
            </div>
          </div>
        `;
      }
    } else {
      contentEl.innerHTML = `<div class="card"><h2>${route.title}</h2><p>View content coming soon.</p></div>`;
    }
  } catch (error) {
    console.error(`Error loading route module ${hash}:`, error);
    contentEl.innerHTML = `<div class="card" style="border-color: var(--badge-coral)"><h2 style="color: var(--badge-coral)">Error</h2><p>Failed to load view module.</p></div>`;
  }
}
