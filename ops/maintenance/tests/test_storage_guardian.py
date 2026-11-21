import importlib.util
from pathlib import Path
import unittest

MODULE=Path("/srv/knaba/maintenance/bin/knaba-storage-guardian.py")
spec=importlib.util.spec_from_file_location("guardian", MODULE)
guardian=importlib.util.module_from_spec(spec)
spec.loader.exec_module(guardian)

class GuardianContract(unittest.TestCase):
    def test_nas_and_live_data_are_explicitly_protected(self):
        text="\n".join(getattr(guardian, "PROTECTED_PATHS", ()))
        for required in (
            "/srv/knaba-nas",
            "/var/lib/docker",
            "/srv/knaba/customer",
            "/srv/knaba/lead-agent",
            "/srv/vsp",
            "/srv/avenqo",
            "/opt/knaba",
        ):
            self.assertIn(required, text)

    def test_auto_below_pressure_does_not_delete(self):
        self.assertEqual(guardian.allow_actions("auto", 19, 1, True), [])

    def test_auto_pressure_only_allows_system_cache_cleanup(self):
        actions=guardian.allow_actions("auto", 82, 1, True)
        names=[x[0] for x in actions]
        self.assertEqual(names, ["apt_cache"])
        flat=" ".join(" ".join(x[1]) for x in actions)
        self.assertNotIn("docker", flat.lower())
        self.assertNotIn("/srv/", flat)

    def test_high_pressure_may_vacuum_old_journal_but_not_docker(self):
        actions=guardian.allow_actions("auto", 87, 1, True)
        names=[x[0] for x in actions]
        self.assertEqual(names, ["apt_cache", "archived_journal_30d"])
        flat=" ".join(" ".join(x[1]) for x in actions)
        self.assertNotIn("docker", flat.lower())

    def test_busy_workload_fails_closed(self):
        fn=getattr(guardian, "allowed_actions_for_state", None)
        self.assertIsNotNone(fn, "guardian must expose fail-closed state helper")
        if fn is not None:
            self.assertEqual(fn("auto", 95, 95, False), [])

if __name__ == "__main__":
    unittest.main(verbosity=2)
