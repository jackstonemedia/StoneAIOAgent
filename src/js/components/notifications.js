import { db } from '../firebase.js';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, writeBatch, getDocs } from 'firebase/firestore';

let unsubscribe = null;
let currentUid = null;

export function initNotifications(uid) {
  if (unsubscribe) unsubscribe();
  currentUid = uid;

  const notifRef = collection(db, 'users', uid, 'notifications');
  const q = query(notifRef, where('read', '==', false), orderBy('createdAt', 'desc'));

  unsubscribe = onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateBellIcon(notifications.length);
    renderNotificationPanel(notifications);
  });

  setupPanelUI();
}

function setupPanelUI() {
  // Check if panel exists
  if (document.getElementById('notification-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'notification-panel';
  panel.style.position = 'fixed';
  panel.style.top = '60px';
  panel.style.right = '20px';
  panel.style.width = '380px';
  panel.style.maxHeight = 'calc(100vh - 80px)';
  panel.style.background = 'var(--bg-surface)';
  panel.style.border = '1px solid var(--border-color)';
  panel.style.borderRadius = '8px';
  panel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
  panel.style.zIndex = '9000';
  panel.style.display = 'none';
  panel.style.flexDirection = 'column';
  panel.style.overflow = 'hidden';
  panel.style.fontFamily = 'var(--font-sans)';

  panel.innerHTML = `
    <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2);">
      <h3 style="margin: 0; font-size: 1rem; font-weight: 600;">Notifications</h3>
      <button id="btn-mark-all-read" class="btn btn-sm" style="background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.75rem;">Mark all read</button>
    </div>
    <div id="notification-list" style="overflow-y: auto; flex: 1; max-height: 400px;">
      <div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;">No new notifications</div>
    </div>
  `;

  document.body.appendChild(panel);

  document.getElementById('btn-mark-all-read').addEventListener('click', async () => {
    if (!currentUid) return;
    try {
      const notifRef = collection(db, 'users', currentUid, 'notifications');
      const q = query(notifRef, where('read', '==', false));
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();
    } catch (e) {
      console.error("Failed to mark all read", e);
    }
  });

  // Find bell icon and attach click
  const bellIcon = document.getElementById('notification-bell');
  if (bellIcon) {
    bellIcon.style.position = 'relative';
    bellIcon.style.cursor = 'pointer';

    // Add badge if it doesn't exist
    let badge = document.getElementById('notification-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'notification-badge';
      badge.style.position = 'absolute';
      badge.style.top = '-4px';
      badge.style.right = '-4px';
      badge.style.background = 'var(--badge-coral)';
      badge.style.color = 'white';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = 'bold';
      badge.style.padding = '2px 5px';
      badge.style.borderRadius = '10px';
      badge.style.display = 'none';
      badge.style.transition = 'transform 0.2s';
      bellIcon.appendChild(badge);
    }

    bellIcon.addEventListener('click', () => {
      const p = document.getElementById('notification-panel');
      p.style.display = p.style.display === 'none' ? 'flex' : 'none';
    });
  }
}

function updateBellIcon(count) {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;

  if (count > 0) {
    const oldCount = parseInt(badge.textContent || '0');
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'block';

    if (count > oldCount) {
      // Pulse animation
      badge.style.transform = 'scale(1.5)';
      setTimeout(() => {
        badge.style.transform = 'scale(1)';
      }, 200);
    }
  } else {
    badge.style.display = 'none';
  }
}

function renderNotificationPanel(notifications) {
  const list = document.getElementById('notification-list');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.875rem;">No new notifications</div>`;
    return;
  }

  list.innerHTML = notifications.map(n => {
    let borderColor = 'var(--border-color)';
    let actionText = 'View';
    let actionTab = '';

    switch (n.type) {
      case 'reflection_ready':
        borderColor = 'var(--badge-purple)';
        actionText = 'Review';
        actionTab = 'reflections';
        break;
      case 'evolution_needs_approval':
        borderColor = 'var(--badge-amber)';
        actionText = 'Review Changes';
        actionTab = 'performance';
        break;
      case 'evolution_applied':
        borderColor = 'var(--badge-teal)';
        actionText = 'View Agent';
        actionTab = 'performance';
        break;
      case 'experiment_complete':
        borderColor = 'var(--badge-blue)';
        actionText = 'See Results';
        break;
      case 'low_performance':
        borderColor = 'var(--badge-coral)';
        actionText = 'Investigate';
        actionTab = 'performance';
        break;
      case 'drift_detected':
        borderColor = 'var(--badge-amber)'; // orange
        actionText = 'Review & Restore';
        break;
    }

    return `
      <div class="notification-card" data-id="${n.id}" data-agent="${n.agentId || ''}" data-tab="${actionTab}" style="padding: 1rem; border-bottom: 1px solid var(--border-color); border-left: 4px solid ${borderColor}; cursor: pointer; transition: background 0.2s;">
        <div style="font-weight: 600; font-size: 0.875rem; margin-bottom: 0.25rem; color: var(--text-primary);">${n.title || 'Notification'}</div>
        <div style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.75rem; line-height: 1.4;">${n.message || ''}</div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7;">${n.createdAt?.toDate ? new Date(n.createdAt.toDate()).toLocaleDateString() : 'Just now'}</span>
          <button class="btn btn-sm" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); font-size: 0.75rem; padding: 0.25rem 0.75rem;">${actionText}</button>
        </div>
      </div>
    `;
  }).join('');

  // Attach click handlers
  document.querySelectorAll('.notification-card').forEach(card => {
    card.addEventListener('click', async (e) => {
      const id = card.dataset.id;
      const agentId = card.dataset.agent;
      const tab = card.dataset.tab;

      // Mark read
      try {
        await updateDoc(doc(db, 'users', currentUid, 'notifications', id), { read: true });
      } catch (err) {
        console.error("Failed to mark read", err);
      }

      // Navigate
      if (agentId && window.agentsView && window.agentsView.openDetail) {
        document.getElementById('notification-panel').style.display = 'none';

        // If we are not on agents view, we'd need to switch views first.
        window.location.hash = '#agents';

        setTimeout(() => {
          if (window.agentsView && window.agentsView.openDetail) {
            window.agentsView.openDetail(agentId);
            if (tab) {
              setTimeout(() => {
                // Switch to learning tab in agent detail
                window.agentsView.switchTab('learning');
                if (window.learningView && window.learningView.switchLearningTab) {
                  window.learningView.switchLearningTab(tab);
                }
              }, 100);
            }
          }
        }, 300);
      }
    });

    card.addEventListener('mouseenter', () => card.style.background = 'rgba(255,255,255,0.02)');
    card.addEventListener('mouseleave', () => card.style.background = 'transparent');
  });
}
