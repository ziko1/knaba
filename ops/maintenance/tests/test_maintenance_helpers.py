import importlib.util
from pathlib import Path
import tempfile
import unittest

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

class HelpersContract(unittest.TestCase):
    def test_runtime_sha_validation(self):
        m=load("/srv/knaba/maintenance/bin/knaba-restore-drill.py","drill")
        self.assertTrue(m.valid_sha("a"*40))
        self.assertFalse(m.valid_sha("A"*40))
        self.assertFalse(m.valid_sha("../bad"))

    def test_env_parser_is_exact(self):
        m=load("/srv/knaba/maintenance/bin/knaba-restore-drill.py","drill2")
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/"runtime.env"
            p.write_text("#x\nGIT_SHA="+"b"*40+"\nOTHER=value=with=equals\n")
            self.assertEqual(m.read_git_sha(p),"b"*40)

    def test_failure_payload_has_no_secret_fields(self):
        m=load("/srv/knaba/maintenance/bin/knaba-maintenance-failure.py","failure")
        payload=m.build_payload("knaba-host-health.service",{"Result":"exit-code","ExecMainStatus":"2"})
        self.assertEqual(payload["unit"],"knaba-host-health.service")
        self.assertEqual(payload["result"],"exit-code")
        self.assertNotIn("environment",payload)
        self.assertNotIn("command",payload)

if __name__=="__main__":
    unittest.main(verbosity=2)
