import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("configure_accounts", ROOT / "configure_accounts.py")
CONFIGURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONFIGURE)
OVERRIDES = {path.name: path.read_text()
             for path in (ROOT / "cockpit/tenant-overrides").glob("*.override.json")}


class TenantUIInstallTests(unittest.TestCase):
    def test_cockpit_login_response_uses_token_and_cookie_not_echoed_username(self):
        check = CONFIGURE.valid_cockpit_login_response
        self.assertTrue(check(200, b'{"csrf-token":"test-token"}', "cockpit=test-cookie"))
        for status, data, cookie in [
            (401, b'{"csrf-token":"test-token"}', "cockpit=test-cookie"),
            (200, b'{"user":"vsp"}', "cockpit=test-cookie"),
            (200, b'{"csrf-token":""}', "cockpit=test-cookie"),
            (200, b'{"csrf-token":null}', "cockpit=test-cookie"),
            (200, b'{"csrf-token":"test-token"}', ""),
            (200, b'{"csrf-token":"test-token"}', "cockpit="),
            (200, b'not-json', "cockpit=test-cookie"),
            (200, b'[]', "cockpit=test-cookie"),
        ]:
            with self.subTest(status=status, data=data, cookie=cookie):
                self.assertFalse(check(status, data, cookie))

    def run_writer(self, home):
        return subprocess.run(
            [sys.executable, "-B", "-c", CONFIGURE.TENANT_UI_WRITER, json.dumps(OVERRIDES)],
            env={**os.environ, "HOME": str(home)}, capture_output=True, text=True,
        )

    def test_creates_private_exact_overrides_and_preserves_other_preferences(self):
        with tempfile.TemporaryDirectory() as value:
            home = Path(value)
            (home / ".config").mkdir()
            unrelated = home / ".config/other-app.conf"
            unrelated.write_text("keep")
            result = self.run_writer(home)
            self.assertEqual(result.returncode, 0, result.stderr)
            for name, expected in OVERRIDES.items():
                path = home / ".config/cockpit" / name
                self.assertEqual(path.read_text(), expected)
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(unrelated.read_text(), "keep")

    def test_existing_override_refused_without_partial_install(self):
        with tempfile.TemporaryDirectory() as value:
            home = Path(value)
            target = home / ".config/cockpit"
            target.mkdir(parents=True)
            (target / "shell.override.json").write_text("existing")
            result = self.run_writer(home)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(sorted(p.name for p in target.iterdir()), ["shell.override.json"])
            self.assertEqual((target / "shell.override.json").read_text(), "existing")

    def test_directory_symlinks_refused(self):
        for name in (".config", ".config/cockpit"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as value:
                home = Path(value) / "home"
                home.mkdir()
                elsewhere = Path(value) / "elsewhere"
                elsewhere.mkdir()
                link = home / name
                link.parent.mkdir(exist_ok=True)
                link.symlink_to(elsewhere, target_is_directory=True)
                result = self.run_writer(home)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(list(elsewhere.iterdir()), [])

    def test_override_symlink_refused_without_touching_destination(self):
        with tempfile.TemporaryDirectory() as value:
            home = Path(value)
            target = home / ".config/cockpit"
            target.mkdir(parents=True)
            original = home / "important"
            original.write_text("keep")
            (target / "users.override.json").symlink_to(original)
            result = self.run_writer(home)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(original.read_text(), "keep")
            self.assertEqual(len(list(target.iterdir())), 1)

    def test_writable_by_others_config_refused(self):
        with tempfile.TemporaryDirectory() as value:
            home = Path(value)
            config = home / ".config"
            config.mkdir(mode=0o777)
            config.chmod(0o777)
            result = self.run_writer(home)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((config / "cockpit").exists())


if __name__ == "__main__":
    unittest.main()
