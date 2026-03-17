import '../css/main.css';
import { setupAuthUI, onAuthStateChange, isGuestMode } from './auth.js';
import { initRouter } from './router.js';
import { initToast } from './components/toast.js';
import { initNotifications } from './components/notifications.js';
import { initUsageBar } from './components/usage-bar.js';
import { initRunModal } from './components/run-modal.js';
import { OnboardingFlow } from './onboarding.js';

let currentUser = null;
let initialized = false;

export function getCurrentUser() {
  return currentUser;
}

function setupMobileMenu() {
  const hamburger = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');

  if (hamburger && sidebar) {
    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 &&
        !sidebar.contains(e.target) &&
        !hamburger.contains(e.target) &&
        sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
    });

    const navLinks = sidebar.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('open');
        }
      });
    });
  }
}

async function initApp() {
  initToast();
  setupAuthUI();
  setupMobileMenu();

  // Listen for guest mode entry (triggered by guest button in auth.js)
  const guestBtn = document.getElementById('guest-btn');
  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      if (!initialized) {
        OnboardingFlow.start();
      }
    });
  }

  onAuthStateChange((user) => {
    currentUser = user;
    if (user) {
      initNotifications(user.uid);
      initUsageBar();
      initRunModal();
      if (!initialized) {
        OnboardingFlow.start();
      }
    }
  });

  document.addEventListener('onboardingComplete', () => {
    if (!initialized) {
      initRouter();
      initialized = true;
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
