import importlib.util
from pathlib import Path
import tempfile
import unittest

MODULE=Path("/srv/knaba/maintenance/bin/knaba-offhost-sync.py")

class OffhostContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location("offhost",MODULE)
        cls.m=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.m)

    def test_only_encrypted_lead_agent_files_are_eligible(self):
        m=self.m
        self.assertTrue(m.eligible(Path("/srv/knaba/lead-agent/backups/a.tar.enc")))
        self.assertTrue(m.eligible(Path("/srv/knaba/lead-agent/backups/a.tar.enc.hmac")))
        self.assertFalse(m.eligible(Path("/srv/knaba/customer/backups/production/x.sqlite")))
        self.assertFalse(m.eligible(Path("/srv/knaba-nas/data/user/files/x")))

    def test_missing_config_is_pending_not_success(self):
        m=self.m
        with tempfile.TemporaryDirectory() as td:
            self.assertEqual(m.config_status(Path(td)/"missing.conf"),"PENDING_CONFIGURATION")

if __name__=="__main__":
    unittest.main(verbosity=2)
