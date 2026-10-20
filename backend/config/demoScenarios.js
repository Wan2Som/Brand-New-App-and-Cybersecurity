/**
 * Canned attacks for the on-stage "Simulate Attack" control. Each one is a
 * normal sensor payload, so it travels the exact same path as a real alert.
 * IPs come from reserved documentation/benchmark ranges (RFC 5737 / 2544).
 */
const DEMO_DEVICE = 'FRONT-DESK-PC';

const scenarios = {
  ransomware: {
    label: 'Ransomware',
    description: 'Invoices folder being encrypted',
    payload: {
      threatType: 'RANSOMWARE',
      severity: 'CRITICAL',
      signatureId: 'RW-003',
      summary: 'Files are being renamed with an encryption extension.',
      evidence: 'FILE_RENAME path=C:/Shared/Invoices/inv-2026-10.xlsx new=C:/Shared/Invoices/inv-2026-10.xlsx.locked',
    },
  },
  brute_force: {
    label: 'Password guessing',
    description: '6 failed admin logins in seconds',
    payload: {
      threatType: 'BRUTE_FORCE',
      severity: 'HIGH',
      signatureId: 'AUTH-001',
      sourceIp: '198.18.0.42',
      summary: '6 failed logins from 198.18.0.42 in under 60s (password guessing).',
      evidence: 'sshd[2211]: Failed password for admin from 198.18.0.42 port 51005 ssh2',
    },
  },
  suspicious_ip: {
    label: 'Criminal server',
    description: 'PC calling a known-bad address',
    payload: {
      threatType: 'SUSPICIOUS_IP',
      severity: 'HIGH',
      signatureId: 'NET-001',
      sourceIp: '203.0.113.66',
      summary: 'Connection involving known-malicious address 203.0.113.66.',
      evidence: 'OUTBOUND ACCEPT src=192.168.1.20 dst=203.0.113.66 dport=443 proto=TCP',
    },
  },
  exfiltration: {
    label: 'Data theft',
    description: '2 GB uploaded to an unknown server',
    payload: {
      threatType: 'DATA_EXFILTRATION',
      severity: 'HIGH',
      signatureId: 'EXF-001',
      sourceIp: '198.18.7.9',
      summary: 'Unusually large outbound transfer (2,048 MB).',
      evidence: 'session src=192.168.1.20 dst=198.18.7.9 dport=443 bytes_out=2147483648',
    },
  },
  unknown: {
    label: 'Unknown anomaly',
    description: 'Audit log wiped by unknown process',
    payload: {
      threatType: 'UNKNOWN_ANOMALY',
      severity: 'MEDIUM',
      signatureId: 'ANOM-001',
      summary: 'Unrecognised critical event in the security log.',
      evidence: 'auditd: CRITICAL audit log cleared by unknown process pid=4412',
    },
  },
};

function buildPayload(id) {
  const scenario = scenarios[id];
  if (!scenario) return null;
  return { ...scenario.payload, deviceId: DEMO_DEVICE, timestamp: new Date().toISOString() };
}

function list() {
  return Object.entries(scenarios).map(([id, { label, description, payload }]) => ({
    id,
    label,
    description,
    severity: payload.severity,
  }));
}

module.exports = { buildPayload, list };
