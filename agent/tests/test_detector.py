"""Run with:  python -m unittest discover -s tests   (from the agent/ folder)"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from detector import (  # noqa: E402
    BRUTE_FORCE, CRITICAL, DATA_EXFILTRATION, HIGH, RANSOMWARE, SUSPICIOUS_IP,
    UNKNOWN_ANOMALY, ThreatDetector,
)


class FakeClock:
    def __init__(self, start=1_000_000.0):
        self.now = start

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def make(clock=None, **kwargs):
    return ThreatDetector(malicious_ips={"203.0.113.66"}, clock=clock or FakeClock(), **kwargs)


class BruteForceTests(unittest.TestCase):
    line = "sshd[1]: Failed password for admin from 198.18.0.42 port 5100 ssh2"

    def test_fires_at_threshold(self):
        detector = make(brute_force_threshold=5)
        results = [detector.inspect(self.line) for _ in range(5)]
        self.assertEqual(results[:4], [None] * 4)
        self.assertEqual(results[4].threat_type, BRUTE_FORCE)
        self.assertEqual(results[4].source_ip, "198.18.0.42")

    def test_window_expires_old_attempts(self):
        clock = FakeClock()
        detector = make(clock, brute_force_threshold=3, brute_force_window=60)
        detector.inspect(self.line)
        detector.inspect(self.line)
        clock.advance(120)
        self.assertIsNone(detector.inspect(self.line))

    def test_success_after_failures_is_critical(self):
        detector = make(brute_force_threshold=6)
        for _ in range(3):
            detector.inspect(self.line)
        hit = detector.inspect("sshd[1]: Accepted password for admin from 198.18.0.42 port 5200 ssh2")
        self.assertEqual(hit.threat_type, BRUTE_FORCE)
        self.assertEqual(hit.severity, CRITICAL)

    def test_generic_and_windows_formats(self):
        detector = make(brute_force_threshold=2)
        detector.inspect("LOGIN_FAILED user=boss ip=10.0.0.9")
        self.assertIsNotNone(detector.inspect("LOGIN_FAILED user=boss ip=10.0.0.9"))
        detector = make(brute_force_threshold=2)
        detector.inspect("EventID=4625 Logon failure Source Network Address: 10.0.0.7")
        self.assertIsNotNone(detector.inspect("EventID=4625 Logon failure Source Network Address: 10.0.0.7"))


class RansomwareTests(unittest.TestCase):
    def test_encrypted_extension(self):
        hit = make().inspect("FILE_RENAME path=a.xlsx new=a.xlsx.locked")
        self.assertEqual((hit.threat_type, hit.severity), (RANSOMWARE, CRITICAL))

    def test_ransom_note(self):
        self.assertEqual(make().inspect("FILE_WRITE path=C:/README_DECRYPT_FILES.txt").threat_type, RANSOMWARE)

    def test_shadow_copy_deletion(self):
        self.assertEqual(make().inspect("cmd: vssadmin.exe delete shadows /all /quiet").signature_id, "RW-001")

    def test_burst_of_file_changes(self):
        detector = make(ransomware_burst_threshold=10)
        results = [detector.inspect(f"FILE_MODIFY path=doc{i}.docx") for i in range(10)]
        self.assertIsNone(results[8])
        self.assertEqual(results[9].severity, HIGH)

    def test_normal_file_save_is_ignored(self):
        self.assertIsNone(make().inspect("FILE_WRITE path=C:/Shared/report.docx"))


class NetworkTests(unittest.TestCase):
    def test_malicious_ip(self):
        hit = make().inspect("OUTBOUND ACCEPT src=192.168.1.20 dst=203.0.113.66 dport=443")
        self.assertEqual((hit.threat_type, hit.source_ip), (SUSPICIOUS_IP, "203.0.113.66"))

    def test_large_exfiltration(self):
        hit = make(exfil_bytes_threshold=1000).inspect("session dst=198.18.7.9 bytes_out=5000")
        self.assertEqual((hit.threat_type, hit.source_ip), (DATA_EXFILTRATION, "198.18.7.9"))

    def test_small_transfer_ignored(self):
        self.assertIsNone(make(exfil_bytes_threshold=1000).inspect("session bytes_out=10"))


class FallbackTests(unittest.TestCase):
    def test_unknown_critical_event(self):
        self.assertEqual(make().inspect("auditd: CRITICAL audit log cleared").threat_type, UNKNOWN_ANOMALY)

    def test_benign_lines(self):
        detector = make()
        for line in ["", "INFO user logged out", "sshd: Accepted password for bob from 10.1.1.1"]:
            self.assertIsNone(detector.inspect(line))


class PayloadTests(unittest.TestCase):
    def test_contract_fields(self):
        hit = make().inspect("FILE_RENAME a.docx.encrypted")
        payload = hit.to_payload("office-pc")
        for key in ("threatType", "timestamp", "severity", "deviceId"):
            self.assertIn(key, payload)
        self.assertTrue(payload["timestamp"].endswith("Z"))
        self.assertEqual(payload["deviceId"], "office-pc")


if __name__ == "__main__":
    unittest.main()
