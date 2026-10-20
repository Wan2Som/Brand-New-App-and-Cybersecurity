"""
Sensor configuration.

Every value can be overridden with an environment variable so the same agent
binary works on the presenter's laptop and on a real SME machine.
"""

import os
import socket


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


# --- Transport -------------------------------------------------------------

# Backend webhook that receives threat payloads.
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "http://localhost:4000/api/webhook/agent")

# Shared secret sent in the X-Agent-Token header. Must match the backend's
# AGENT_SHARED_SECRET. Leave empty only for local demos.
AGENT_TOKEN = os.getenv("AGENT_SHARED_SECRET", "dev-agent-secret")

# HTTP timeout and retry policy for the webhook call.
HTTP_TIMEOUT_SECONDS = _env_int("AGENT_HTTP_TIMEOUT", 5)
MAX_RETRIES = _env_int("AGENT_MAX_RETRIES", 3)

# --- Sensor ----------------------------------------------------------------

# Identifier for this machine, shown on the dashboard.
DEVICE_ID = os.getenv("DEVICE_ID", socket.gethostname())

# Log file to watch. The demo simulator writes to the same default path.
LOG_FILE = os.getenv(
    "AGENT_LOG_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", "security.log"),
)

# How often (seconds) the watcher checks the file for new lines. 0.25s keeps
# end-to-end detection comfortably under the 2-second target.
POLL_INTERVAL_SECONDS = float(os.getenv("AGENT_POLL_INTERVAL", "0.25"))

# Do not re-alert the same threat type + source more often than this.
ALERT_COOLDOWN_SECONDS = _env_int("AGENT_ALERT_COOLDOWN", 30)

# --- Detection thresholds --------------------------------------------------

# Brute force: N failed logins from one source inside the window.
BRUTE_FORCE_THRESHOLD = _env_int("BRUTE_FORCE_THRESHOLD", 5)
BRUTE_FORCE_WINDOW_SECONDS = _env_int("BRUTE_FORCE_WINDOW", 60)

# Ransomware: N suspicious file renames/writes inside the window, or any
# single ransom-note / encrypted-extension hit.
RANSOMWARE_BURST_THRESHOLD = _env_int("RANSOMWARE_BURST_THRESHOLD", 20)
RANSOMWARE_WINDOW_SECONDS = _env_int("RANSOMWARE_WINDOW", 30)

# Data exfiltration: a single outbound transfer larger than this (bytes).
EXFIL_BYTES_THRESHOLD = _env_int("EXFIL_BYTES_THRESHOLD", 500 * 1024 * 1024)

# Known-bad IPs. In production, load this from a threat-intel feed. The
# defaults are reserved documentation ranges (RFC 5737) used by the demo.
MALICIOUS_IPS = set(
    _env_list("MALICIOUS_IPS", ["203.0.113.66", "198.51.100.23", "192.0.2.199"])
)

# Optional file with one IP per line, merged into MALICIOUS_IPS at startup.
MALICIOUS_IP_FILE = os.getenv("MALICIOUS_IP_FILE", "")
