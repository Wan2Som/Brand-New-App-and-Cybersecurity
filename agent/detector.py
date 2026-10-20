"""
Threat signature engine.

Pure logic: no file or network I/O lives here, so every rule can be unit
tested by feeding it log lines. `ThreatDetector.inspect(line)` returns a
`Detection` when a line (alone or combined with recent history) matches a
signature, otherwise `None`.

Supported threat types (must match backend/playbooks/nistPlaybooks.json):
    RANSOMWARE, SUSPICIOUS_IP, DATA_EXFILTRATION, BRUTE_FORCE, UNKNOWN_ANOMALY
"""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Iterable, Optional

# --- Threat types & severities ---------------------------------------------

RANSOMWARE = "RANSOMWARE"
SUSPICIOUS_IP = "SUSPICIOUS_IP"
DATA_EXFILTRATION = "DATA_EXFILTRATION"
BRUTE_FORCE = "BRUTE_FORCE"
UNKNOWN_ANOMALY = "UNKNOWN_ANOMALY"

LOW, MEDIUM, HIGH, CRITICAL = "LOW", "MEDIUM", "HIGH", "CRITICAL"

# --- Signature patterns ----------------------------------------------------

IPV4 = r"(?:\d{1,3}\.){3}\d{1,3}"
IPV4_RE = re.compile(rf"\b({IPV4})\b")

# Failed logins: OpenSSH, Windows 4625 exports, and the generic app format.
FAILED_LOGIN_RES = [
    re.compile(rf"Failed password for (?:invalid user )?\S+ from ({IPV4})", re.I),
    re.compile(rf"authentication failure;.*rhost=({IPV4})", re.I),
    re.compile(rf"EventID[=: ]+4625\b.*?(?:Source Network Address|ip)[=: ]+({IPV4})", re.I),
    re.compile(rf"LOGIN_FAILED\b.*?\bip=({IPV4})", re.I),
]

# Successful logins (used to escalate brute force to a likely compromise).
SUCCESS_LOGIN_RES = [
    re.compile(rf"Accepted (?:password|publickey) for \S+ from ({IPV4})", re.I),
    re.compile(rf"EventID[=: ]+4624\b.*?(?:Source Network Address|ip)[=: ]+({IPV4})", re.I),
    re.compile(rf"LOGIN_SUCCESS\b.*?\bip=({IPV4})", re.I),
]

RANSOM_EXTENSION_RE = re.compile(
    r"\.(?:locked|encrypted|crypt|crypted|enc|ransom|lockbit|wncry|wcry|akira|phobos)\b", re.I
)
RANSOM_NOTE_RE = re.compile(
    r"\b(?:README|HOW_TO|HOW-TO|RESTORE|DECRYPT|RECOVER)[\w\-]*"
    r"(?:FILES|DECRYPT|RESTORE|RECOVER|DATA)[\w\-]*\.(?:txt|html?|hta)\b",
    re.I,
)
FILE_ACTIVITY_RE = re.compile(r"\bFILE_(?:RENAME|WRITE|MODIFY|DELETE)\b", re.I)
SHADOW_COPY_RE = re.compile(r"vssadmin(?:\.exe)?\s+delete\s+shadows|wmic\s+shadowcopy\s+delete", re.I)

BYTES_OUT_RES = [
    re.compile(r"\bbytes_out=(\d+)", re.I),
    re.compile(r"\bsent[=: ](\d+)\s*bytes", re.I),
]

# Generic "something is badly wrong" markers. Only used when no specific
# signature matched, which routes the incident to the universal playbook.
ANOMALY_RE = re.compile(
    r"\b(?:CRITICAL|ALERT|EMERG(?:ENCY)?|kernel panic|segfault|tamper(?:ed|ing)?|"
    r"unauthori[sz]ed|privilege escalation|audit log cleared|EventID[=: ]+1102)\b",
    re.I,
)


# --- Result type -------------------------------------------------------------


@dataclass
class Detection:
    threat_type: str
    severity: str
    signature_id: str
    summary: str
    evidence: str
    source_ip: Optional[str] = None
    detected_at: float = field(default_factory=time.time)

    @property
    def dedupe_key(self) -> str:
        return f"{self.threat_type}:{self.source_ip or '-'}"

    def to_payload(self, device_id: str) -> dict:
        """Webhook body. The first four keys are the contract required by the backend."""
        return {
            "threatType": self.threat_type,
            "timestamp": datetime.fromtimestamp(self.detected_at, tz=timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "severity": self.severity,
            "deviceId": device_id,
            "signatureId": self.signature_id,
            "summary": self.summary,
            "sourceIp": self.source_ip,
            "evidence": self.evidence,
        }


# --- Detector ----------------------------------------------------------------


class ThreatDetector:
    """Stateful detector: keeps short sliding windows for rate-based rules."""

    def __init__(
        self,
        malicious_ips: Iterable[str] = (),
        brute_force_threshold: int = 5,
        brute_force_window: int = 60,
        ransomware_burst_threshold: int = 20,
        ransomware_window: int = 30,
        exfil_bytes_threshold: int = 500 * 1024 * 1024,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.malicious_ips = set(malicious_ips)
        self.brute_force_threshold = brute_force_threshold
        self.brute_force_window = brute_force_window
        self.ransomware_burst_threshold = ransomware_burst_threshold
        self.ransomware_window = ransomware_window
        self.exfil_bytes_threshold = exfil_bytes_threshold
        self._clock = clock

        self._failed_logins: dict[str, deque[float]] = defaultdict(deque)
        self._file_events: deque[float] = deque()

    # Public API -------------------------------------------------------------

    def inspect(self, line: str) -> Optional[Detection]:
        line = line.strip()
        if not line:
            return None

        # Order matters: most damaging / most specific first.
        for rule in (
            self._check_ransomware,
            self._check_malicious_ip,
            self._check_exfiltration,
            self._check_brute_force,
            self._check_unknown_anomaly,
        ):
            detection = rule(line)
            if detection:
                return detection
        return None

    # Rules ----------------------------------------------------------------------

    def _check_ransomware(self, line: str) -> Optional[Detection]:
        if SHADOW_COPY_RE.search(line):
            return self._hit(RANSOMWARE, CRITICAL, "RW-001",
                             "Backup shadow copies are being deleted (classic ransomware prep).", line)
        if RANSOM_NOTE_RE.search(line):
            return self._hit(RANSOMWARE, CRITICAL, "RW-002",
                             "A ransom note file appeared on the system.", line)
        if FILE_ACTIVITY_RE.search(line) and RANSOM_EXTENSION_RE.search(line):
            return self._hit(RANSOMWARE, CRITICAL, "RW-003",
                             "Files are being renamed with an encryption extension.", line)

        if FILE_ACTIVITY_RE.search(line):
            now = self._clock()
            events = self._file_events
            events.append(now)
            self._expire(events, now, self.ransomware_window)
            if len(events) >= self.ransomware_burst_threshold:
                events.clear()
                return self._hit(RANSOMWARE, HIGH, "RW-004",
                                 f"Unusual burst of file changes ({self.ransomware_burst_threshold}+ "
                                 f"in {self.ransomware_window}s).", line)
        return None

    def _check_malicious_ip(self, line: str) -> Optional[Detection]:
        if not self.malicious_ips:
            return None
        for ip in IPV4_RE.findall(line):
            if ip in self.malicious_ips:
                return self._hit(SUSPICIOUS_IP, HIGH, "NET-001",
                                 f"Connection involving known-malicious address {ip}.", line, ip)
        return None

    def _check_exfiltration(self, line: str) -> Optional[Detection]:
        for pattern in BYTES_OUT_RES:
            match = pattern.search(line)
            if match and int(match.group(1)) >= self.exfil_bytes_threshold:
                ips = IPV4_RE.findall(line)
                mb = int(match.group(1)) / (1024 * 1024)
                return self._hit(DATA_EXFILTRATION, HIGH, "EXF-001",
                                 f"Unusually large outbound transfer ({mb:,.0f} MB).",
                                 line, ips[-1] if ips else None)
        return None

    def _check_brute_force(self, line: str) -> Optional[Detection]:
        now = self._clock()

        ip = _first_group(FAILED_LOGIN_RES, line)
        if ip:
            attempts = self._failed_logins[ip]
            attempts.append(now)
            self._expire(attempts, now, self.brute_force_window)
            if len(attempts) >= self.brute_force_threshold:
                count = len(attempts)
                attempts.clear()
                return self._hit(BRUTE_FORCE, HIGH, "AUTH-001",
                                 f"{count} failed logins from {ip} in under "
                                 f"{self.brute_force_window}s (password guessing).", line, ip)
            return None

        ip = _first_group(SUCCESS_LOGIN_RES, line)
        if ip:
            attempts = self._failed_logins.get(ip)
            if attempts:
                self._expire(attempts, now, self.brute_force_window)
            # A success right after a run of failures = attacker probably got in.
            if attempts and len(attempts) >= max(2, self.brute_force_threshold // 2):
                attempts.clear()
                return self._hit(BRUTE_FORCE, CRITICAL, "AUTH-002",
                                 f"Successful login from {ip} straight after repeated failures "
                                 "(account likely compromised).", line, ip)
        return None

    def _check_unknown_anomaly(self, line: str) -> Optional[Detection]:
        if ANOMALY_RE.search(line):
            ips = IPV4_RE.findall(line)
            return self._hit(UNKNOWN_ANOMALY, MEDIUM, "ANOM-001",
                             "Unrecognised critical event in the security log.",
                             line, ips[0] if ips else None)
        return None

    # Helpers -------------------------------------------------------------------

    def _hit(self, threat_type, severity, signature_id, summary, line, source_ip=None) -> Detection:
        return Detection(
            threat_type=threat_type,
            severity=severity,
            signature_id=signature_id,
            summary=summary,
            evidence=line[:300],
            source_ip=source_ip,
            detected_at=self._clock(),
        )

    @staticmethod
    def _expire(window: deque, now: float, seconds: int) -> None:
        while window and now - window[0] > seconds:
            window.popleft()


def _first_group(patterns: list[re.Pattern], line: str) -> Optional[str]:
    for pattern in patterns:
        match = pattern.search(line)
        if match:
            return match.group(1)
    return None
