// src/js/components/loading.js

let activeRequests = 0;
let loadingBarElement = null;

function initLoadingBar() {
    if (loadingBarElement) return;

    loadingBarElement = document.createElement('div');
    loadingBarElement.id = 'global-loading-bar';

    // Style for 4px purple top fixed bar
    Object.assign(loadingBarElement.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '0%',
        height: '4px',
        backgroundColor: '#9333ea', // Match premium purple accent
        zIndex: '9999',
        transition: 'width 0.3s ease, opacity 0.3s ease',
        opacity: '0',
        pointerEvents: 'none',
        boxShadow: '0 0 10px rgba(147, 51, 234, 0.5)'
    });

    document.body.appendChild(loadingBarElement);

    // Add the CSS keyframes for the indeterminate animated loading
    const style = document.createElement('style');
    style.textContent = `
    @keyframes loading-progress {
      0% { width: 0%; left: 0; right: auto; }
      50% { width: 100%; left: 0; right: auto; }
      50.1% { width: 100%; left: auto; right: 0; }
      100% { width: 0%; left: auto; right: 0; }
    }
  `;
    document.head.appendChild(style);
}

export function showLoading() {
    if (!loadingBarElement) initLoadingBar();

    activeRequests++;

    if (activeRequests > 0) {
        loadingBarElement.style.opacity = '1';
        loadingBarElement.style.animation = 'loading-progress 1.5s infinite linear';
    }
}

export function hideLoading() {
    activeRequests = Math.max(0, activeRequests - 1);

    if (activeRequests === 0 && loadingBarElement) {
        loadingBarElement.style.opacity = '0';
        loadingBarElement.style.animation = 'none';
        loadingBarElement.style.width = '0%';
    }
}
