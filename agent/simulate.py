"""
Attack simulator for live demos.

Appends realistic attack log lines to the file the agent is watching, so the
whole real pipeline runs: log -> detector -> webhook -> Firebase -> dashboard.

    python simulate.py brute_force
    python simulate.py ransomware
    python simulate.py suspicious_ip
    python simulate.py exfiltration
    python simulate.py unknown
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime

import config

ATTACKER_IP = "203.0.113.66"  # RFC 5737 documentation range, listed in config.MALICIOUS_IPS
GUESSING_IP = "198.18.0.42"   # benchmark range, deliberately NOT on the blocklist


def _ts() -> str:
    return datetime.now().strftime("%b %d %H:%M:%S")


SCENARIOS = {
    "brute_force": lambda: [
        f"{_ts()} office-pc sshd[2211]: Failed password for admin from {GUESSING_IP} port 51{i:03d} ssh2"
        for i in range(6)
    ],
    "suspicious_ip": lambda: [
        f"{_ts()} office-pc kernel: OUTBOUND ACCEPT src=192.168.1.20 dst={ATTACKER_IP} dport=443 proto=TCP",
    ],
    "ransomware": lambda: [
        f"{_ts()} office-pc fsmon: FILE_RENAME path=C:/Shared/Invoices/inv-2026-10.xlsx "
        f"new=C:/Shared/Invoices/inv-2026-10.xlsx.locked",
        f"{_ts()} office-pc fsmon: FILE_WRITE path=C:/Shared/README_DECRYPT_FILES.txt",
    ],
    "exfiltration": lambda: [
        f"{_ts()} office-pc netflow: session src=192.168.1.20 dst=198.18.7.9 dport=443 "
        f"bytes_out={2 * 1024 * 1024 * 1024}",
    ],
    "unknown": lambda: [
        f"{_ts()} office-pc auditd: CRITICAL audit log cleared by unknown process pid=4412",
    ],
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write simulated attack lines to the watched log")
    parser.add_argument("scenario", choices=sorted(SCENARIOS))
    parser.add_argument("--log", default=config.LOG_FILE)
    parser.add_argument("--delay", type=float, default=0.05, help="seconds between lines")
    args = parser.parse_args(argv)

    os.makedirs(os.path.dirname(os.path.abspath(args.log)), exist_ok=True)
    lines = SCENARIOS[args.scenario]()
    with open(args.log, "a", encoding="utf-8") as handle:
        for line in lines:
            handle.write(line + "\n")
            handle.flush()
            time.sleep(args.delay)
    print(f"Wrote {len(lines)} '{args.scenario}' line(s) to {args.log}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
