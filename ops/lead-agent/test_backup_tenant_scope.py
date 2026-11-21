"""Unit tests for portable backup scope. No live Docker, PostgreSQL or server access."""
from contextlib import ExitStack
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location("backup_operator", Path(__file__).with_name("backup-lead-agent.py"))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

TEST_A = "00000000-0000-4000-8000-000000000001"
TEST_B = "00000000-0000-4000-8000-000000000002"


class TenantScopeTests(unittest.TestCase):
    def test_reads_two_scoped_companies_in_canonical_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "backup-qa-uuids.json"
            path.write_text(json.dumps([TEST_B, TEST_A]))
            with patch.object(backup, "read_file", side_effect=lambda p, limit: p.read_bytes()) as read:
                companies = backup.read_expected_companies(path)
            read.assert_called_once_with(path, limit=512)
        self.assertEqual(companies, [backup.COMPANY, "telegram-qa-" + TEST_A, "telegram-qa-" + TEST_B])

    def test_all_modes_block_before_mutating_or_running_commands(self):
        invalid = [
            b"{}", b"[", b'["*","*"]', b"\xff", b"null",
            json.dumps([TEST_A]).encode(), json.dumps([TEST_A] * 2).encode(),
            json.dumps([TEST_A, TEST_B, TEST_A]).encode(),
            json.dumps([TEST_A, "00000000-0000-0000-0000-000000000000"]).encode(),
        ]
        for mode in ("backup", "run", "install-timer"):
            for raw in [None, *invalid]:
                with self.subTest(mode=mode, raw=raw), ExitStack() as stack:
                    def probe(path, create=False):
                        self.assertFalse(create, "unexpected directory creation")
                    stack.enter_context(patch.object(backup.os, "geteuid", return_value=0))
                    stack.enter_context(patch.object(backup.socket, "gethostname", return_value="knaba"))
                    stack.enter_context(patch.object(backup.os, "umask"))
                    stack.enter_context(patch.object(backup, "private_dir", side_effect=probe))
                    stack.enter_context(patch.object(backup, "read_file", return_value=raw,
                                                     side_effect=FileNotFoundError if raw is None else None))
                    for target in (backup.os, backup.subprocess):
                        name = "open" if target is backup.os else "run"
                        stack.enter_context(patch.object(target, name, side_effect=AssertionError("unexpected I/O")))
                    stack.enter_context(patch.object(backup.sys, "argv", [
                        "backup-lead-agent.py", mode, "--sha", "a"*40, "--private-env", "/unused",
                    ]))
                    with self.assertRaisesRegex(backup.Blocked, "BACKUP_QA_UUID_CONFIG_"):
                        backup.main()

    def test_private_scope_only_reaches_the_two_container_checks(self):
        operator = object.__new__(backup.Operator)
        operator.args = Mock(sha="a"*40)
        operator.qa_id = "sha256:" + "0"*64
        operator.expected_companies = [backup.COMPANY, "telegram-qa-" + TEST_A, "telegram-qa-" + TEST_B]
        operator.environment = {"DATABASE_URL": "synthetic", "BACKUP_PASSPHRASE": "synthetic"}
        operator.run_id = "1"*24
        operator.command = Mock()
        for phase in ("manifest", "proof", "snapshot", "restore"):
            operator.container(phase, ["true"])
            env = operator.command.call_args.kwargs["env"]
            name = "KNABA_BACKUP_EXPECTED_COMPANIES"
            if phase in ("manifest", "proof"):
                self.assertEqual(json.loads(env[name]), operator.expected_companies)
            else:
                self.assertNotIn(name, env)


if __name__ == "__main__":
    unittest.main()
