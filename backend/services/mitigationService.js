/**
 * Hardening ("Prevent" phase) action adapters.
 *
 * Each action is only ever run after an explicit human click (HITL). In this
 * MVP every adapter is SIMULATED: it records what would happen and returns a
 * receipt. Replace the body of an adapter with a real integration (Google
 * Workspace Admin SDK, Microsoft Graph, router API, backup tool ...) without
 * touching routes, state machine or UI.
 */

const adapters = {
  'enforce-2fa': async () => ({
    detail: '2-step verification required for all staff accounts at next sign-in.',
    integration: 'Google Workspace Admin SDK / Microsoft Graph (conditional access)',
  }),
  'account-lockout': async () => ({
    detail: 'Accounts now lock for 15 minutes after 5 wrong passwords.',
    integration: 'Directory password policy',
  }),
  'block-ip': async ({ sourceIp }) => ({
    detail: `${sourceIp || 'Attacker address'} added to the firewall blocklist.`,
    integration: 'Router / firewall API',
  }),
  'offline-backup': async () => ({
    detail: 'Nightly backup scheduled for 11:00 PM to disconnected storage.',
    integration: 'Backup agent scheduler',
  }),
  'auto-updates': async () => ({
    detail: 'Automatic security updates enabled on all managed PCs.',
    integration: 'Windows Update for Business / MDM',
  }),
  'endpoint-protection': async () => ({
    detail: 'Endpoint protection rollout queued for every registered PC.',
    integration: 'EDR vendor deployment API',
  }),
  'phishing-training': async () => ({
    detail: '5-minute phishing awareness lesson sent to all staff.',
    integration: 'Email / LMS',
  }),
  'upload-alerts': async () => ({
    detail: 'Phone alert enabled for outbound transfers over 500 MB.',
    integration: 'Sensor agent threshold + push notification',
  }),
  'least-access': async () => ({
    detail: 'Folder access review checklist created for the owner.',
    integration: 'File server / SharePoint permissions report',
  }),
};

async function apply(actionId, context = {}) {
  const adapter = adapters[actionId];
  if (!adapter) {
    const error = new Error(`No adapter registered for action "${actionId}"`);
    error.status = 400;
    throw error;
  }
  const result = await adapter(context);
  return { actionId, simulated: true, appliedAt: new Date().toISOString(), ...result };
}

function hasAdapter(actionId) {
  return Object.prototype.hasOwnProperty.call(adapters, actionId);
}

module.exports = { apply, hasAdapter };
