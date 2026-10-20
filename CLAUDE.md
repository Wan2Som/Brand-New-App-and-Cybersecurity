# CLAUDE.md: project context for Claude Code

Siaga / SME Cyber Responder: a hackathon MVP that guides non-technical Malaysian SME owners through a cyber incident in four phases, **Hack → Fix → Learn → Prevent**. Deployed on Vercel (two projects) with Firebase Realtime Database. Repo: `Wan2Som/Siaga_SME-Responder`.

## Layout

- `agent/`: Python 3.9+ sensor, stdlib only. `agent.py` tails a log, `detector.py` holds signatures (RANSOMWARE, SUSPICIOUS_IP, DATA_EXFILTRATION, BRUTE_FORCE, UNKNOWN_ANOMALY), `simulate.py` writes fake attack lines. POSTs `{threatType, timestamp, severity, deviceId, ...}` to the backend with header `X-Agent-Token`.
- `backend/`: Node 20+ Express. Entry `server.js` (listens locally; exported as the handler on Vercel). App in `appFactory.js` (deliberately NOT `app.js`, which Vercel would treat as the entry point).
  - `services/incidentService.js`: the phase state machine and single source of truth. Only explicit human actions advance it (`confirmStep`, `acknowledgeLearn`, `applyMitigation`). Mutations are serialised; in Firebase mode, state is re-read before every change.
  - `services/geminiService.js`: read-only AI advisor. System prompt, context injection, REST call. `guardrails.js` blocks unsafe replies (EN + BM); `fallbackResponder.js` gives deterministic playbook text (EN + BM).
  - `services/firebaseService.js` + `firebaseCredentials.js`: RTDB adapter, forgiving key parsing, `firebaseProblem` reason on `/api/health`.
  - `playbooks/nistPlaybooks.json` (English, source of truth for ids/order) + `nistPlaybooks.ms.json` (Malay text overrides keyed by step/action id).
- `frontend/`: Next.js pages router. `src/pages/index.jsx` composes hooks + components; no logic in components. i18n in `src/lib/i18n/` (`messages.js` holds every UI phrase in `en` and `ms`).

## Commands

```bash
cd agent && python -m unittest discover -s tests      # detector tests
cd backend && npm install && npm test                 # node:test suite (33 tests)
cd backend && npm start                               # API on :4000
cd frontend && npm install && npm run dev             # dashboard on :3000
cd agent && python agent.py                           # sensor; python simulate.py ransomware to trigger
```

The frontend has never been through a real `npm run build` (it was only checked with a TypeScript syntax pass and an esbuild preview). Run `cd frontend && npm run build` early to confirm.

## Rules to keep

- **Human-in-the-loop:** the AI never changes state and never returns buttons. Buttons come from the playbook in state. Don't add any code path where the model triggers an action.
- **Languages:** every UI string goes in `frontend/src/lib/i18n/messages.js` under BOTH `en` and `ms` with the same `{placeholders}`. Every playbook string needs a Malay entry in `nistPlaybooks.ms.json`; `backend/tests/i18n.test.js` fails otherwise. The EN/BM switch decides the AI's reply language.
- **Vercel bundling gotcha:** Vercel only ships files the code references literally. Load data files with literal `require('../playbooks/xyz.json')`, never a path built at runtime. This exact bug once dropped the Malay playbooks from production. A test enforces it for playbook files.
- **Firebase is required on Vercel** (serverless: no in-memory state, no long-lived SSE). Locally it's optional; without it, state is in memory and the dashboard uses SSE (`/api/incident/stream`).
- **Firebase drops empty arrays/objects.** Normalise after reading (`normalize()` in incidentService, `normalizeState()` in frontend `lib/incident.js`).
- Timeline entries store English `text` plus language-neutral `params`; the frontend renders them per language.
- Never put secrets in the repo. `.env`, `.env.local` and service-account keys are git-ignored.

## Deployment (Vercel)

- Backend project: root `backend`. Env vars: `FIREBASE_DATABASE_URL`, either `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` or `FIREBASE_SERVICE_ACCOUNT_JSON`, `AGENT_SHARED_SECRET`, `FRONTEND_ORIGIN` (supports one `*` wildcard for preview URLs), `DEMO_MODE`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.8-flash`), optional `GEMINI_FALLBACK_MODEL`, `GEMINI_TIMEOUT_MS`.
- Frontend project: root `frontend`. `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_FIREBASE_*` web config.
- Health check: `GET /api/health` should show `"transport":"firebase"` and `"languages":["en","ms"]`.
- Workflow: `git add . && git commit -m "..." && git pull --rebase origin main && git push`. Vercel redeploys both projects automatically.

## Open items

1. **Gemini in production (2026-10-20):** the 403 (API not enabled on the key's Google project) is fixed. Remaining cause of fallbacks is `gemini-3.8-flash` being overloaded (HTTP 503 "high demand", replies taking 15-30 s). `callGemini` now retries once on 500/503, using `GEMINI_FALLBACK_MODEL` if set. `GEMINI_TIMEOUT_MS=30000` is set on Vercel; consider a faster model.
2. Have a native speaker review the Malay wording (`nistPlaybooks.ms.json`, `messages.js`).
3. Brand is **Siaga**, with the tagline "Cyber Responder" (EN) / "Tindak Balas Siber" (BM) beside it (`messages.js` → `brand`, `tagline`, `title`). API errors are shown with translated text (`errorText` in `lib/i18n`), not the backend's English message.
4. Mitigation actions in `services/mitigationService.js` are simulated (UI shows "Demo: simulated"). Real integrations would go in each adapter.
5. After the hackathon, set `DEMO_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false`.
6. Verify the escalation contacts (Cyber999 1-300-88-2999, NSRC 997) and the PDPA 72-hour wording before any real use.
