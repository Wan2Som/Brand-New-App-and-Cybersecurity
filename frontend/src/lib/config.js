/**
 * Frontend configuration (NEXT_PUBLIC_* variables are inlined at build time).
 */
export const API_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, '');

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

export const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const FIREBASE_STATE_PATH = process.env.NEXT_PUBLIC_FIREBASE_STATE_PATH || 'sme/status';

/** Firebase is used when a database URL is configured; otherwise the backend SSE stream. */
export const USE_FIREBASE = Boolean(FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.apiKey);
