/**
 * Firebase Realtime Database listener. The SDK is imported lazily so the app
 * still loads (and uses SSE) when Firebase is not configured.
 */
import { FIREBASE_CONFIG, FIREBASE_STATE_PATH } from './config';

let dbPromise = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getDatabase } = await import('firebase/database');
      const app = getApps()[0] || initializeApp(FIREBASE_CONFIG);
      return getDatabase(app);
    })();
  }
  return dbPromise;
}

/**
 * Subscribe to the incident state. Returns an unsubscribe function.
 * @param {(state: object) => void} onState
 * @param {(connected: boolean) => void} onConnection
 */
export function subscribeToState(onState, onConnection, onError) {
  let unsubscribers = [];
  let cancelled = false;

  (async () => {
    try {
      const db = await getDb();
      const { ref, onValue } = await import('firebase/database');
      if (cancelled) return;
      unsubscribers.push(onValue(ref(db, FIREBASE_STATE_PATH), (snap) => onState(snap.val()), onError));
      unsubscribers.push(onValue(ref(db, '.info/connected'), (snap) => onConnection(snap.val() === true)));
    } catch (err) {
      onError?.(err);
    }
  })();

  return () => {
    cancelled = true;
    unsubscribers.forEach((off) => off());
    unsubscribers = [];
  };
}
