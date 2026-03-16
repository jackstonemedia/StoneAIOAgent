import { auth, db } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const provider = new GoogleAuthProvider();

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
  } catch (error) {
    console.error("Error signing in:", error);
    alert("Failed to sign in. See console for details.");
  }
}

export async function signOut() {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error("Error signing out:", error);
  }
}

export function onAuthStateChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function setupAuthUI() {
  const loginOverlay = document.getElementById('login-overlay');
  const appLayout = document.getElementById('app-layout');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  
  if (loginBtn) {
    loginBtn.addEventListener('click', signIn);
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', signOut);
  }

  onAuthStateChange(async (user) => {
    if (user) {
      if (loginOverlay) loginOverlay.style.display = 'none';
      if (appLayout) appLayout.style.display = 'flex';
      
      const userNameEl = document.getElementById('sidebar-user-name');
      const userAvatarEl = document.getElementById('sidebar-user-avatar');
      if (userNameEl) userNameEl.textContent = user.displayName || user.email;
      if (userAvatarEl) {
        userAvatarEl.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || user.email)}&background=7c3aed&color=fff`;
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

    } else {
      if (loginOverlay) loginOverlay.style.display = 'flex';
      if (appLayout) appLayout.style.display = 'none';
    }
  });
}
