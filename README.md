# Siaga: SME Cyber Responder (MVP)

An interactive cyber incident response platform for Malaysian SMEs. When an attack hits, a non-technical owner is walked through **Hack → Fix → Learn → Prevent**, one physical step at a time, with an AI guide that can advise but never act on its own.

```
 log file ──► Python sensor ──► POST /api/webhook/agent ──► incident state machine ──► Firebase RTDB / SSE ──► dashboard
 (agent/)     detector.py        (X-Agent-Token)             (backend/services)          (< 2 s, measured 0.3 s)   (frontend/)
                                                                     ▲
                                              human button presses ──┘   Gemini reads state, never writes it
```

## Quick start (3 terminals, no cloud accounts needed)

```bash
# 1. Backend  (Node 20+)
cd backend && cp .env.example .env && npm install && npm start      # http://localhost:4000

# 2. Dashboard
cd frontend && cp .env.example .env.local && npm install && npm run dev   # http://localhost:3000

# 3. Sensor  (Python 3.9+, stdlib only)
cd agent && AGENT_SHARED_SECRET=dev-agent-secret python agent.py
```

With no `GEMINI_API_KEY` and no Firebase config, everything still works: the chat uses the vetted playbook text and live updates flow over Server-Sent Events. Add the keys to switch on Gemini and Firebase.

### Running the pitch demo

- **Presenter controls** (bottom-left of the dashboard) fire a canned attack through the same intake path as a real alert, and show how fast it reached the screen.
- **Real sensor path:** with `agent.py` running, trigger it from a 4th terminal:
  ```bash
  cd agent && python simulate.py ransomware     # or brute_force | suspicious_ip | exfiltration | unknown
  ```
  This writes realistic log lines to `agent/logs/security.log`; the agent detects them and calls the webhook.
- Press **Reset to secure** between runs.

## Deploy to Vercel

The repo deploys as **two Vercel projects** from the same Git repository, plus the sensor running on the business's own PC.

```
 SME's PC                          Vercel                                 Google
 ┌──────────────┐  HTTPS  ┌──────────────────────┐   writes   ┌──────────────────────┐
 │ agent.py     │ ──────► │ backend (Express)    │ ─────────► │ Firebase Realtime DB │
 └──────────────┘         │ root dir: backend/   │            └──────────┬───────────┘
                          └──────────────────────┘                       │ live updates
                          ┌──────────────────────┐ ◄─────────────────────┘
                          │ frontend (Next.js)   │
                          │ root dir: frontend/  │
                          └──────────────────────┘
```

**Firebase is required on Vercel.** Vercel runs the backend as short-lived serverless functions, so nothing can be kept in memory between requests and a long-lived SSE stream isn't reliable. Firebase holds the incident state and pushes live updates to the dashboard. (Locally, Firebase stays optional.)

### 1. Firebase (10 minutes)
1. In the [Firebase console](https://console.firebase.google.com) create a project, then **Build → Realtime Database → Create database**.
2. In the database's **Rules** tab, paste `backend/firebase/database.rules.json` and publish.
3. **Project settings → Service accounts → Generate new private key.** Keep this JSON secret (it's for the backend only).
4. **Project settings → General → Your apps → Web app (</>)**. Copy the `apiKey`, `authDomain`, `databaseURL`, `projectId` and `appId` (these are public, for the dashboard).

### 2. Push the repo to GitHub
Unzip, then `git init && git add . && git commit -m "init"` and push to a new GitHub repo. `.gitignore` already keeps `.env` files and service-account keys out.

### 3. Backend project
On [vercel.com/new](https://vercel.com/new), import the repo, set **Root Directory = `backend`** (Vercel detects Express from `server.js`), and add these environment variables:

| Variable | Value |
|---|---|
| `FIREBASE_DATABASE_URL` | e.g. `https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the service-account key file as base64 (or raw JSON). **Or** instead set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, copied from the key file |
| `AGENT_SHARED_SECRET` | a long random string |
| `FRONTEND_ORIGIN` | your dashboard URL(s), e.g. `https://sme-responder.vercel.app,https://sme-responder-*.vercel.app` (the `*` covers preview deploys) |
| `DEMO_MODE` | `true` for the pitch, `false` afterwards |
| `GEMINI_API_KEY` | optional, from Google AI Studio |

Deploy, then open `https://<backend>.vercel.app/api/health`. It should show `"transport":"firebase"`. If it shows `"local"`, the `firebaseProblem` field says exactly what to fix (wrong file, damaged key, console link instead of database link, and so on).

### 4. Frontend project
Import the **same repo again** as a second project with **Root Directory = `frontend`** (Next.js is detected automatically). Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://<backend>.vercel.app` |
| `NEXT_PUBLIC_DEMO_MODE` | `true` for the pitch |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._DATABASE_URL`, `..._PROJECT_ID`, `..._APP_ID` | from step 1.4 |

Deploy, then add the frontend's URL to the backend's `FRONTEND_ORIGIN` if you hadn't already, and redeploy the backend.

### 5. Point the sensor at the cloud
```bash
cd agent
WEBHOOK_URL=https://<backend>.vercel.app/api/webhook/agent \
AGENT_SHARED_SECRET=<same secret as the backend> \
DEVICE_ID=FRONT-DESK-PC python agent.py
```

**Checks after deploying:** the top bar shows "Sensor live", **Demo → Ransomware** turns the page red, and `python simulate.py ransomware` on the sensor PC does the same.

## The four phases

| Phase | What triggers it | What the owner sees |
|---|---|---|
| **Hack** | Sensor signature match → webhook → state `BREACH_DETECTED` | Banner flashes red, chat input auto-focuses, guide explains in plain words |
| **Fix** | Each confirmation button (`I unplugged it`, …) | One step at a time from the NIST/CISA playbook. Steps can't be skipped or double-confirmed. |
| **Learn** | All containment steps confirmed → `CONTAINED` | Banner turns amber; post-mortem with a business analogy |
| **Prevent** | `Got it, show me how to prevent this` | 1-click hardening actions (`Enforce 2FA now`, …). All applied → banner turns green. |
| **Fallback** | Unrecognised anomaly or unknown `threatType` | Universal containment: isolate network, **keep the PC on to preserve RAM**, escalate to Cyber999 / IT vendor |

## Human-in-the-loop guarantees

1. **AI is read-only.** `routes/chat.js` reads state from the server; the browser can't inject context. Gemini returns text only. Action buttons are rendered from the playbook, never from model output.
2. **Only button presses advance the workflow.** `incidentService` accepts the *current* `stepId` only; mutations are serialised so double-clicks can't skip steps. Mitigations require `confirmed: true`.
3. **Output guardrails** (`services/guardrails.js`) reject replies that claim to have acted ("I've blocked…"), ask for passwords/OTPs, advise paying a ransom, include commands, or link to unvetted sites. Blocked or failed replies fall back to deterministic playbook text.
4. **Prompt-injection aware.** Log evidence (attacker-controlled) is passed to the model as fenced, explicitly untrusted data.

## Project structure

```
Siaga_SME-Responder/
├── agent/                       Local Python sensor (stdlib only)
│   ├── agent.py                 Polling tail -F, cooldown, webhook client with retries
│   ├── detector.py              Signatures: ransomware, malicious IP, exfiltration, brute force, unknown anomaly
│   ├── config.py                Env-driven settings and thresholds
│   ├── simulate.py              Writes realistic attack lines for demos
│   └── tests/test_detector.py
├── backend/                     Node.js / Express
│   ├── server.js                Entry point: listens locally, exported as the handler on Vercel
│   ├── appFactory.js            Express app (routes, CORS, health)
│   ├── config/                  index.js (env), demoScenarios.js
│   ├── routes/                  webhook.js, chat.js, incident.js, demo.js
│   ├── services/
│   │   ├── incidentService.js   Phase state machine (source of truth)
│   │   ├── alertService.js      Single intake path (webhook + demo)
│   │   ├── playbookService.js   Playbook lookup + {deviceId}/{sourceIp} interpolation
│   │   ├── firebaseService.js   RTDB writes, or in-memory + SSE when not configured
│   │   ├── geminiService.js     System prompt, context injection, REST client
│   │   ├── guardrails.js        Output safety checks
│   │   ├── fallbackResponder.js Deterministic playbook replies
│   │   └── mitigationService.js 1-click hardening adapters (simulated in MVP)
│   ├── middleware/ · utils/     Agent auth, rate limit, errors, payload validation
│   ├── playbooks/nistPlaybooks.json      English playbooks (source of truth)
│   ├── playbooks/nistPlaybooks.ms.json   Bahasa Melayu text
│   ├── firebase/database.rules.json
│   └── tests/
└── frontend/                    Next.js (pages router)
    └── src/
        ├── pages/index.jsx      Composition only
        ├── components/          TopBar, ThemeToggle, StatusBanner, StatusOrb, PhaseTrack, ProtectionStatus, ActionCard,
        │                        ChatWindow, ChatMessage, IncidentTimeline, MomentOverlay, DemoControl
        ├── hooks/               useRealtimeAlert, useChat, useIncidentActions, useTheme, useStatusMoment, useSpotlight, useProtectionStats
        ├── lib/                 api, config, firebaseClient, incident selectors, safe markdown, i18n/ (EN + BM)
        └── styles/globals.css
```

## Languages: English and Bahasa Melayu

The **EN / BM** switch in the top bar changes the whole app, and the choice is remembered on each device (a browser set to Malay starts in BM).

- **Interface:** every label, button and message (`frontend/src/lib/i18n/messages.js`).
- **Playbooks:** every step, explanation and fix (`backend/playbooks/nistPlaybooks.ms.json`). English stays the source of truth for step order and ids; the Malay file only overrides text, and a test fails if any step is missing or has mismatched `{placeholders}`.
- **Incident record and receipts:** re-rendered in the viewer's language.
- **Chat guide:** replies in the chosen language, with Gemini or in offline playbook mode. Switching language mid-incident makes the guide restate the current step in the new language. If the owner types in the other language, Gemini answers in the language they typed.
- **Safety checks** on AI replies cover Bahasa Melayu too (claims of having acted, asking for passwords, suggesting paying the ransom).

## Look and feel

Frosted-glass panels over a soft colour backdrop that follows the security status (green, red, amber). The **Light / Dark / Auto** switch in the top bar is remembered per browser; Auto follows the device setting. Fonts use Apple's SF Pro where available and Inter elsewhere.

- **Status orb:** green radar sweep while watching, red heartbeat with shockwaves under attack, amber turning shield ring when contained.
- **Moments:** a red edge flash and banner shake when a breach lands; a green wave and "All clear" toast when it's resolved. They don't replay on page reload.
- **Protection status:** when idle, the main card shows real numbers from the backend (time watching, attack types recognised, incidents resolved) and live system checks.
- All motion switches off for users with "reduce motion" turned on.

## Configuration

**Backend `.env`:** `AGENT_SHARED_SECRET`, `DEMO_MODE`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.8-flash`), `GEMINI_FALLBACK_MODEL` (optional, tried once if the main model is overloaded), `GEMINI_THINKING_LEVEL`, `GEMINI_TIMEOUT_MS`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_PATH`. See `backend/.env.example`.

**Frontend `.env.local`:** `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_DEMO_MODE`, and the `NEXT_PUBLIC_FIREBASE_*` web config. With a Firebase database URL set, the dashboard listens with `onValue`; otherwise it uses SSE.

**Agent (env vars):** `WEBHOOK_URL`, `AGENT_SHARED_SECRET`, `DEVICE_ID`, `AGENT_LOG_FILE`, thresholds such as `BRUTE_FORCE_THRESHOLD`, and `MALICIOUS_IPS` / `MALICIOUS_IP_FILE`.

### Firebase setup (optional)
1. Create a Realtime Database, deploy `backend/firebase/database.rules.json` (clients read `sme/status`, only the backend writes).
2. Download a service-account key → `FIREBASE_SERVICE_ACCOUNT_PATH`, set `FIREBASE_DATABASE_URL`.
3. Put the web app config in `frontend/.env.local`.

## API

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/webhook/agent` | `{ threatType, timestamp, severity, deviceId, sourceIp?, summary?, evidence? }` | Requires `X-Agent-Token` |
| POST | `/api/chat` | `{ event?, message?, history? }` | Events: `BREACH_OPENED`, `STEP_CONFIRMED`, `ENTER_LEARN`, `ENTER_PREVENT`, `RESOLVED`, `ESCALATED`, `USER_MESSAGE` |
| GET | `/api/incident/state` · `/stream` | | Snapshot / SSE |
| POST | `/api/incident/confirm` | `{ stepId }` | 409 if not the current step |
| POST | `/api/incident/learn` | | |
| POST | `/api/incident/mitigate` | `{ actionId, confirmed: true }` | |
| POST | `/api/incident/escalate` | `{ note? }` | |
| POST | `/api/demo/simulate` · `/reset` | `{ scenario }` | Only when `DEMO_MODE=true` |

## Tests

```bash
cd agent && python -m unittest discover -s tests     # 15 detector tests
cd backend && npm test                               # 33 tests: state machine, Gemini, guardrails, CORS, Firebase key, translations
```

## Before going beyond a hackathon

- **Mitigations are simulated.** Each adapter in `mitigationService.js` returns a receipt and is labelled "Demo: simulated" in the UI. Wire them to Google Workspace / Microsoft Graph / your router API.
- Have a qualified professional review `nistPlaybooks.json`, and re-check the escalation contacts (Cyber999, NSRC) and the PDPA 72-hour notification wording before a real deployment.
- Single-tenant. On Vercel, state changes are read-then-write against Firebase, which is fine for one business but would need Firebase transactions for many simultaneous users. Rate limiting is per serverless instance. Multi-customer use needs per-tenant paths in Firebase and authenticated dashboard reads (the sample rules make `sme/status` publicly readable).
- Set `DEMO_MODE=false` and a strong `AGENT_SHARED_SECRET` in production.
