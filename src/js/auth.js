import { auth, db } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const provider = new GoogleAuthProvider();

let isGuest = false;
let guestInteractions = 0;
const GUEST_INTERACTION_LIMIT = 3;

export function isGuestMode() {
  return isGuest;
}

export function checkGuestLimit(actionName = 'this action') {
  if (!isGuest) return true;
  guestInteractions++;
  if (guestInteractions > GUEST_INTERACTION_LIMIT) {
    showSignupModal();
    return false;
  }
  return true;
}

function showSignupModal() {
  // Check if modal already exists
  let existing = document.getElementById('signup-modal');
  if (existing) { existing.style.display = 'flex'; return; }

  const modal = document.createElement('div');
  modal.id = 'signup-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-content" style="width: 420px; padding: 2.5rem; text-align: center;">
      <div style="font-size: 2.5rem; margin-bottom: 1rem;">⚡</div>
      <h2 style="font-family: var(--font-heading); margin-bottom: 0.5rem;">Unlock the full platform</h2>
      <p style="color: var(--text-secondary); margin-bottom: 2rem; font-size: 0.9rem;">
        Create a free account to access all features and start building your AI agent team.
      </p>
      <div style="text-align: left; margin-bottom: 2rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-secondary);">
          <span style="color: var(--accent-primary);">✓</span> Unlimited agent creation & customization
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-secondary);">
          <span style="color: var(--accent-primary);">✓</span> 50 free agent runs per day
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem; font-size: 0.85rem; color: var(--text-secondary);">
          <span style="color: var(--accent-primary);">✓</span> Team memory & self-improving strategies
        </div>
      </div>
      <button id="signup-modal-btn" class="btn btn-primary" style="width: 100%; padding: 0.85rem; margin-bottom: 1rem;">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
        Sign up with Google — it's free
      </button>
      <span class="guest-link" id="signup-modal-dismiss" style="font-size: 0.8rem;">Maybe later</span>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('signup-modal-btn').addEventListener('click', () => {
    modal.style.display = 'none';
    signIn();
  });
  document.getElementById('signup-modal-dismiss').addEventListener('click', () => {
    modal.style.display = 'none';
  });
}

export async function signIn() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        plan: "free",
        cloudComputerStatus: "inactive",
        agentRunsToday: 0,
        lastResetDate: new Date().toISOString().split('T')[0],
        lastLoginAt: serverTimestamp()
      });
    } else {
      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp()
      });
    }
    // Exiting guest mode
    isGuest = false;
    guestInteractions = 0;
  } catch (error) {
    console.error("Error signing in:", error);
  }
}

export async function signOut() {
  try {
    await firebaseSignOut(auth);
    isGuest = false;
    guestInteractions = 0;
  } catch (error) {
    console.error("Error signing out:", error);
  }
}

export function enterGuestMode() {
  isGuest = true;
  guestInteractions = 0;

  const loginOverlay = document.getElementById('login-overlay');
  const appLayout = document.getElementById('app-layout');
  const guestBanner = document.getElementById('guest-banner');

  if (loginOverlay) loginOverlay.style.display = 'none';
  if (appLayout) appLayout.style.display = 'flex';
  if (guestBanner) guestBanner.style.display = 'flex';

  // Set guest user info
  const userNameEl = document.getElementById('sidebar-user-name');
  const userAvatarEl = document.getElementById('sidebar-user-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  if (userNameEl) userNameEl.textContent = 'Guest';
  if (userAvatarEl) userAvatarEl.src = 'https://ui-avatars.com/api/?name=G&background=1e2340&color=8892b0';
  if (logoutBtn) logoutBtn.textContent = 'Sign in';

  const usageTextEl = document.getElementById('sidebar-usage-text');
  if (usageTextEl) usageTextEl.textContent = `0/3 (guest)`;
}

export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function setupAuthUI() {
  const loginOverlay = document.getElementById('login-overlay');
  const appLayout = document.getElementById('app-layout');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const guestBtn = document.getElementById('guest-btn');
  const guestBanner = document.getElementById('guest-banner');
  const guestSignupBtn = document.getElementById('guest-signup-btn');

  if (loginBtn) loginBtn.addEventListener('click', signIn);
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    if (isGuest) {
      // Guest clicking "Sign in"
      if (appLayout) appLayout.style.display = 'none';
      if (guestBanner) guestBanner.style.display = 'none';
      if (loginOverlay) loginOverlay.style.display = 'flex';
      isGuest = false;
    } else {
      signOut();
    }
  });
  if (guestBtn) guestBtn.addEventListener('click', enterGuestMode);
  if (guestSignupBtn) guestSignupBtn.addEventListener('click', signIn);

  onAuthStateChange(async (user) => {
    if (user) {
      isGuest = false;
      if (loginOverlay) loginOverlay.style.display = 'none';
      if (appLayout) appLayout.style.display = 'flex';
      if (guestBanner) guestBanner.style.display = 'none';

      const userNameEl = document.getElementById('sidebar-user-name');
      const userAvatarEl = document.getElementById('sidebar-user-avatar');
      const logoutBtnEl = document.getElementById('logout-btn');
      if (userNameEl) userNameEl.textContent = user.displayName || user.email;
      if (logoutBtnEl) logoutBtnEl.textContent = 'Sign out';
      if (userAvatarEl) {
        userAvatarEl.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=e8622c&color=fff`;
      }

      // Fetch usage data
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          const runs = data.agentRunsToday || 0;
          const maxRuns = 50;
          const usageTextEl = document.getElementById('sidebar-usage-text');
          const usageFillEl = document.getElementById('sidebar-usage-fill');
          if (usageTextEl) usageTextEl.textContent = `${runs}/${maxRuns}`;
          if (usageFillEl) usageFillEl.style.width = `${Math.min((runs / maxRuns) * 100, 100)}%`;
        }
      } catch (e) {
        console.error("Error fetching user data:", e);
      }

    } else if (!isGuest) {
      if (loginOverlay) loginOverlay.style.display = 'flex';
      if (appLayout) appLayout.style.display = 'none';
      if (guestBanner) guestBanner.style.display = 'none';
    }
  });
}
