"""
SME Cyber Responder - local sensor agent.

Tails a security log in real time, runs each new line through the threat
detector and POSTs a payload to the backend webhook when something matches.

Stdlib only, so it runs on any office PC with Python 3.9+:

    python agent.py                       # watch the default log file
    python agent.py --log /var/log/auth.log
    python agent.py --dry-run             # print alerts instead of sending
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
import time
import urllib.error
import urllib.request
from typing import Iterator, Optional

import config
from detector import Detection, ThreatDetector

log = logging.getLogger("sme-agent")


# --- File watcher ------------------------------------------------------------


class LogTailer:
    """Polling `tail -F`: survives the file not existing yet, truncation and rotation."""

    def __init__(self, path: str, from_start: bool = False, poll_interval: float = 0.25):
        self.path = path
        self.poll_interval = poll_interval
        self._from_start = from_start
        self._handle = None
        self._inode: Optional[int] = None
        self._buffer = ""
        self._running = True

    def stop(self) -> None:
        self._running = False

    def lines(self) -> Iterator[str]:
        while self._running:
            if self._handle is None and not self._open():
                time.sleep(self.poll_interval)
                continue

            chunk = self._handle.read()
            if chunk:
                self._buffer += chunk
                *complete, self._buffer = self._buffer.split("\n")
                yield from complete
                continue

            if self._rotated_or_truncated():
                log.info("Log file rotated or truncated, reopening %s", self.path)
                self._close()
                self._from_start = True  # read the new file from its beginning
                continue

            time.sleep(self.poll_interval)
        self._close()

    def _open(self) -> bool:
        try:
            self._handle = open(self.path, "r", encoding="utf-8", errors="replace")
        except FileNotFoundError:
            return False
        self._inode = os.fstat(self._handle.fileno()).st_ino
        if not self._from_start:
            self._handle.seek(0, os.SEEK_END)
        log.info("Watching %s", self.path)
        return True

    def _rotated_or_truncated(self) -> bool:
        try:
            stat = os.stat(self.path)
        except FileNotFoundError:
            return True
        return stat.st_ino != self._inode or stat.st_size < self._handle.tell()

    def _close(self) -> None:
        if self._handle:
            self._handle.close()
        self._handle = None
        self._buffer = ""


# --- Webhook client ------------------------------------------------------------


class WebhookClient:
    def __init__(self, url: str, token: str, timeout: int, max_retries: int):
        self.url = url
        self.token = token
        self.timeout = timeout
        self.max_retries = max_retries

    def send(self, payload: dict) -> bool:
        body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json", "User-Agent": "sme-cyber-agent/1.0"}
        if self.token:
            headers["X-Agent-Token"] = self.token

        for attempt in range(1, self.max_retries + 1):
            request = urllib.request.Request(self.url, data=body, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    log.info("Alert delivered (%s): %s", response.status, payload["threatType"])
                    return True
            except urllib.error.HTTPError as err:
                # 4xx = our payload or token is wrong; retrying will not help.
                if 400 <= err.code < 500:
                    log.error("Backend rejected alert (%s): %s", err.code, err.read()[:200])
                    return False
                log.warning("Backend error %s (attempt %d/%d)", err.code, attempt, self.max_retries)
            except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
                log.warning("Backend unreachable: %s (attempt %d/%d)", err, attempt, self.max_retries)
            time.sleep(min(0.5 * 2 ** (attempt - 1), 4))
        log.error("Giving up on alert after %d attempts", self.max_retries)
        return False


# --- Agent loop ----------------------------------------------------------------


class SensorAgent:
    def __init__(self, tailer: LogTailer, detector: ThreatDetector, client: Optional[WebhookClient],
                 device_id: str, cooldown_seconds: int):
        self.tailer = tailer
        self.detector = detector
        self.client = client  # None = dry run
        self.device_id = device_id
        self.cooldown_seconds = cooldown_seconds
        self._last_alert: dict[str, float] = {}

    def run(self) -> None:
        for line in self.tailer.lines():
            detection = self.detector.inspect(line)
            if detection:
                self.handle(detection)

    def handle(self, detection: Detection) -> None:
        now = time.time()
        last = self._last_alert.get(detection.dedupe_key, 0)
        if now - last < self.cooldown_seconds:
            log.debug("Suppressed duplicate alert %s", detection.dedupe_key)
            return
        self._last_alert[detection.dedupe_key] = now

        payload = detection.to_payload(self.device_id)
        log.warning("THREAT %s [%s] %s", detection.threat_type, detection.severity, detection.summary)
        if self.client is None:
            print(json.dumps(payload, indent=2))
        else:
            self.client.send(payload)


def load_malicious_ips() -> set[str]:
    ips = set(config.MALICIOUS_IPS)
    if config.MALICIOUS_IP_FILE:
        try:
            with open(config.MALICIOUS_IP_FILE, encoding="utf-8") as handle:
                ips.update(line.strip() for line in handle if line.strip() and not line.startswith("#"))
        except OSError as err:
            log.warning("Could not read MALICIOUS_IP_FILE: %s", err)
    return ips


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SME Cyber Responder sensor agent")
    parser.add_argument("--log", default=config.LOG_FILE, help="log file to watch")
    parser.add_argument("--from-start", action="store_true", help="scan existing lines first")
    parser.add_argument("--dry-run", action="store_true", help="print alerts, do not call the backend")
    parser.add_argument("--verbose", "-v", action="store_true")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
    )

    detector = ThreatDetector(
        malicious_ips=load_malicious_ips(),
        brute_force_threshold=config.BRUTE_FORCE_THRESHOLD,
        brute_force_window=config.BRUTE_FORCE_WINDOW_SECONDS,
        ransomware_burst_threshold=config.RANSOMWARE_BURST_THRESHOLD,
        ransomware_window=config.RANSOMWARE_WINDOW_SECONDS,
        exfil_bytes_threshold=config.EXFIL_BYTES_THRESHOLD,
    )
    client = None if args.dry_run else WebhookClient(
        config.WEBHOOK_URL, config.AGENT_TOKEN, config.HTTP_TIMEOUT_SECONDS, config.MAX_RETRIES
    )
    tailer = LogTailer(args.log, from_start=args.from_start, poll_interval=config.POLL_INTERVAL_SECONDS)
    agent = SensorAgent(tailer, detector, client, config.DEVICE_ID, config.ALERT_COOLDOWN_SECONDS)

    def shutdown(*_):
        log.info("Stopping sensor")
        tailer.stop()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    log.info("Sensor online - device=%s webhook=%s", config.DEVICE_ID,
             "DRY-RUN" if client is None else config.WEBHOOK_URL)
    agent.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
