import importlib.util
from pathlib import Path
import unittest

MODULE=Path("/srv/knaba/maintenance/bin/knaba-host-health.py")

class HealthContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location("health", MODULE)
        cls.health=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.health)

    def test_overall_status_is_fail_closed(self):
        h=self.health
        self.assertEqual(h.overall_status([True, True], []), "OK")
        self.assertEqual(h.overall_status([True], ["warning"]), "WARNING")
        self.assertEqual(h.overall_status([True, False], []), "CRITICAL")

    def test_backup_age_policy(self):
        h=self.health
        self.assertEqual(h.backup_age_status(12, 36), "OK")
        self.assertEqual(h.backup_age_status(40, 36), "CRITICAL")
        self.assertEqual(h.backup_age_status(None, 36), "CRITICAL")

    def test_customer_backup_pattern_matches_real_layout(self):
        h=self.health
        patterns=getattr(h, "CUSTOMER_BACKUP_GLOBS", ())
        self.assertIn("/srv/knaba/customer/backups/production/*.sqlite", patterns)

    def test_backup_service_failure_is_critical(self):
        h=self.health
        self.assertFalse(h.backup_service_ok({"Result":"exit-code","ExecMainStatus":"2"}))
        self.assertTrue(h.backup_service_ok({"Result":"success","ExecMainStatus":"0"}))

    def test_offhost_state_policy(self):
        h=self.health
        self.assertEqual(h.offhost_status("SYNC_VERIFIED", 10, 36), "OK")
        self.assertEqual(h.offhost_status("PENDING_CONFIGURATION", None, 36), "WARNING")
        self.assertEqual(h.offhost_status("SYNC_VERIFIED", 40, 36), "CRITICAL")
        self.assertEqual(h.offhost_status("UPLOAD_FAILED", 1, 36), "CRITICAL")

    def test_disk_pressure_policy(self):
        h=self.health
        self.assertEqual(h.disk_status(79, 10), "OK")
        self.assertEqual(h.disk_status(82, 10), "WARNING")
        self.assertEqual(h.disk_status(91, 10), "CRITICAL")
        self.assertEqual(h.disk_status(20, 91), "CRITICAL")

if __name__ == "__main__":
    unittest.main(verbosity=2)
