"""Offline broker security contracts; these do not certify live host isolation.

Run with: python3 -m unittest discover -s tests -v
All runtime effects are fakes/mocks and all ledgers/files are temporary.
"""
from __future__ import annotations

import concurrent.futures
import copy
import importlib.util
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import tempfile
import threading
import unittest
from unittest import mock
import uuid


MODULE_PATH = Path(__file__).resolve().parents[1] / "sitepanel.py"
SPEC = importlib.util.spec_from_file_location("sitepanel_under_test", MODULE_PATH)
sitepanel = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sitepanel)

KNABA = 1000
VSP = 2002


def registry():
    """Two accounts with disjoint local resources and public site metadata."""
    accounts, resources = {}, {}
    for uid, name in ((KNABA, "knaba"), (VSP, "vsp")):
        site_id = name + "-web"
        accounts[str(uid)] = {
            "name": name,
            "display_name": name.upper(),
            "home": "/srv/" + name,
            "sites": [{
                "id": site_id,
                "label": name.upper() + " site",
                "domains": [name + ".example.invalid"],
                "url": "https://" + name + ".example.invalid",
                "location": "local",
                "resource": site_id,
                "actions": ["start", "stop", "restart", "backup"],
            }],
        }
        resources[site_id] = {
            "kind": "systemd", "target": name + "-web.service",
            "owner_uid": uid, "user": name,
        }
    return {"version": 1, "accounts": accounts, "resources": resources}


def action(site_id="knaba-web", operation="restart", request_id=None):
    return {
        "op": "action", "site_id": site_id, "action": operation,
        "request_id": request_id if request_id is not None else str(uuid.uuid4()),
    }


class FakeRuntime:
    def __init__(self):
        self.reads = []
        self.mutations = []
        self.lock = threading.Lock()
        self.failure = None
        self.entered = None
        self.release = None

    def status(self, resource):
        with self.lock:
            self.reads.append(resource["target"])
        return "running"

    def probe(self, spec):
        return {"status": 200}

    def perform(self, resource, operation):
        with self.lock:
            self.mutations.append((resource["target"], operation))
        if self.entered is not None:
            self.entered.set()
            if not self.release.wait(5):
                raise AssertionError("The test did not release the fake operation")
        if self.failure is not None:
            raise self.failure
        # Distinct receipts expose any accidental cross-account result reuse.
        return {"state": "completed", "receipt": resource["target"] + ":" + operation}


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="sitepanel-tests-")
        self.addCleanup(self.tmp.cleanup)
        self.ledger = Path(self.tmp.name) / "requests.sqlite"
        self.config = registry()
        self.runtime = FakeRuntime()
        self.now = 10000.0
        self.api = sitepanel.API(self.config, self.ledger, self.runtime, clock=lambda: self.now)

    def request(self, uid, body):
        return sitepanel.handle(self.api, uid, body)

    def assert_error(self, result, expected):
        self.assertIs(result["ok"], False, result)
        self.assertEqual(result["error"]["code"], expected, result)
        self.assertNotIn("result", result)

    def test_catalog_includes_only_authenticated_accounts_sites(self):
        for uid, name, foreign in ((KNABA, "knaba", "vsp"), (VSP, "vsp", "knaba")):
            with self.subTest(uid=uid):
                self.runtime.reads.clear()
                result = self.request(uid, {"op": "catalog"})
                self.assertTrue(result["ok"])
                self.assertEqual(result["account"]["name"], name)
                self.assertEqual({row["id"] for row in result["sites"]}, {name + "-web"})
                self.assertEqual(result["sites"][0]["domains"], [name + ".example.invalid"])
                self.assertNotIn(foreign + ".example.invalid", json.dumps(result))
                self.assertEqual(set(self.runtime.reads), {name + "-web.service"})
                for hidden in ("target", "owner_uid", "mount_roots", "resource"):
                    self.assertNotIn(hidden, result["sites"][0])
        self.assertFalse(self.runtime.mutations)

    def test_unknown_uid_cannot_read_catalog_or_run_action(self):
        for uid in (0, 999, 42424):
            for body in ({"op": "catalog"}, action()):
                with self.subTest(uid=uid, op=body["op"]):
                    self.assert_error(self.request(uid, body), "access_denied")
        self.assertFalse(self.runtime.reads)
        self.assertFalse(self.runtime.mutations)

    def test_body_cannot_override_peer_identity(self):
        for field in ("uid", "user", "tenant", "account"):
            for base in ({"op": "catalog"}, action()):
                body = dict(base, **{field: "vsp"})
                with self.subTest(field=field, op=body["op"]):
                    self.assert_error(self.request(KNABA, body), "invalid_request")
        self.assertFalse(self.runtime.reads)
        self.assertFalse(self.runtime.mutations)

    def test_foreign_site_is_denied_before_cached_result_lookup(self):
        own = action()
        self.assertTrue(self.request(KNABA, own)["ok"])
        foreign = dict(own, site_id="vsp-web")
        # An authorization failure must not touch either the ledger or runtime.
        with mock.patch.object(self.api, "db", side_effect=AssertionError("ledger accessed")):
            self.assert_error(self.request(KNABA, foreign), "not_found")
        self.assertEqual(self.runtime.mutations, [("knaba-web.service", "restart")])

    def test_foreign_and_unknown_site_ids_have_same_public_error(self):
        self.assertEqual(
            self.request(KNABA, action("vsp-web")),
            self.request(KNABA, action("does-not-exist")),
        )
        self.assertFalse(self.runtime.mutations)

    def test_action_allowlist_rejects_commands_and_wrong_types(self):
        for operation in ("delete", "exec", "restart; id", "RESTART", None, ["restart"]):
            with self.subTest(operation=operation):
                self.assert_error(self.request(KNABA, action(operation=operation)), "action_not_allowed")
        self.assertFalse(self.runtime.mutations)

    def test_request_identifier_requires_canonical_uuid_string(self):
        valid = "5f61bf70-6e42-43d0-a256-9a3049b7508a"
        for identifier in ("", "not-a-uuid", valid.upper(), valid.replace("-", ""),
                           "{" + valid + "}", 42, [], True):
            with self.subTest(identifier=identifier):
                self.assert_error(self.request(KNABA, action(request_id=identifier)), "invalid_request")
        body = action()
        body["request_id"] = None
        self.assert_error(self.request(KNABA, body), "invalid_request")
        self.assertFalse(self.runtime.mutations)

    def test_same_request_performs_once_even_after_broker_restart(self):
        body = action()
        first = self.request(KNABA, body)
        self.assertTrue(first["ok"])
        self.assertEqual(self.request(KNABA, copy.deepcopy(body)), first)
        new_runtime = FakeRuntime()
        restarted = sitepanel.API(copy.deepcopy(self.config), self.ledger, new_runtime,
                                 clock=lambda: self.now + 3600)
        self.assertEqual(sitepanel.handle(restarted, KNABA, body), first)
        self.assertEqual(self.runtime.mutations, [("knaba-web.service", "restart")])
        self.assertFalse(new_runtime.mutations)

    def test_same_identifier_with_different_payload_conflicts(self):
        body = action()
        self.assertTrue(self.request(KNABA, body)["ok"])
        self.assert_error(self.request(KNABA, dict(body, action="stop")), "request_conflict")
        self.assertEqual(self.runtime.mutations, [("knaba-web.service", "restart")])

    def test_identical_uuid_is_scoped_to_authenticated_uid(self):
        identifier = str(uuid.uuid4())
        knaba = action(request_id=identifier)
        vsp = action("vsp-web", request_id=identifier)
        knaba_result = self.request(KNABA, knaba)
        self.assertTrue(knaba_result["ok"])
        self.assert_error(self.request(VSP, knaba), "not_found")
        vsp_result = self.request(VSP, vsp)
        self.assertTrue(vsp_result["ok"])
        self.assertNotEqual(knaba_result["result"]["receipt"], vsp_result["result"]["receipt"])
        self.assertEqual(self.request(VSP, vsp), vsp_result)
        self.assertEqual(set(self.runtime.mutations), {
            ("knaba-web.service", "restart"), ("vsp-web.service", "restart"),
        })

    def test_timeout_leaves_durable_unknown_and_never_repeats_operation(self):
        self.runtime.failure = subprocess.TimeoutExpired(["fake-operation"], 1)
        body = action()
        self.assert_error(self.request(KNABA, body), "result_unknown")
        with sqlite3.connect(self.ledger) as db:
            row = db.execute("SELECT response FROM requests WHERE uid=? AND request_id=?",
                             (KNABA, body["request_id"])).fetchone()
        self.assertIsNotNone(row, "The pending record must survive the failed operation")
        self.assertIsNone(row[0])
        self.runtime.failure = None
        self.now += 3600
        self.assert_error(self.request(KNABA, body), "result_unknown")
        restarted_runtime = FakeRuntime()
        restarted = sitepanel.API(copy.deepcopy(self.config), self.ledger, restarted_runtime,
                                 clock=lambda: self.now)
        self.assert_error(sitepanel.handle(restarted, KNABA, body), "result_unknown")
        self.assertEqual(self.runtime.mutations, [("knaba-web.service", "restart")])
        self.assertFalse(restarted_runtime.mutations)

    def test_unknown_result_blocks_new_uuid_for_resource_after_restart(self):
        self.runtime.failure = subprocess.TimeoutExpired(["fake-operation"], 1)
        self.assert_error(self.request(KNABA, action()), "result_unknown")
        self.runtime.failure = None
        self.now += 3600  # The resource guard must outlast the rate limiter.
        self.assert_error(self.request(KNABA, action(operation="stop")), "result_unknown")
        self.assertEqual(self.runtime.mutations, [("knaba-web.service", "restart")])
        restarted_runtime = FakeRuntime()
        restarted = sitepanel.API(copy.deepcopy(self.config), self.ledger, restarted_runtime,
                                 clock=lambda: self.now)
        self.assert_error(sitepanel.handle(restarted, KNABA, action(operation="start")),
                          "result_unknown")
        self.assertFalse(restarted_runtime.mutations)
        # The unresolved resource must not disable the other account's resource.
        self.assertTrue(sitepanel.handle(restarted, VSP, action("vsp-web"))["ok"])
        self.assertEqual(restarted_runtime.mutations, [("vsp-web.service", "restart")])

    def test_concurrent_actions_on_same_resource_are_busy(self):
        self.runtime.entered, self.runtime.release = threading.Event(), threading.Event()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(self.request, KNABA, action(operation="restart"))
            try:
                self.assertTrue(self.runtime.entered.wait(2), "First operation did not begin")
                self.assert_error(self.request(KNABA, action(operation="stop")), "busy")
            finally:
                self.runtime.release.set()
            self.assertTrue(first.result(timeout=3)["ok"])
        self.assertEqual(self.runtime.mutations, [("knaba-web.service", "restart")])

    def test_backup_cooldown_prevents_new_request_but_allows_later_backup(self):
        first = action(operation="backup")
        result = self.request(KNABA, first)
        self.assertTrue(result["ok"])
        self.assertEqual(self.request(KNABA, first), result)
        self.now += 599
        self.assert_error(self.request(KNABA, action(operation="backup")), "rate_limited")
        self.assertEqual(self.runtime.mutations, [("knaba-web.service", "backup")])
        # A different account has its own budget.
        self.assertTrue(self.request(VSP, action("vsp-web", operation="backup"))["ok"])
        self.now += 2
        self.assertTrue(self.request(KNABA, action(operation="backup"))["ok"])

    def test_cross_owner_registry_is_rejected_before_runtime_access(self):
        broken = copy.deepcopy(self.config)
        broken["accounts"][str(KNABA)]["sites"][0]["resource"] = "vsp-web"
        with self.assertRaises(ValueError):
            sitepanel.API(broken, Path(self.tmp.name) / "rejected.sqlite", self.runtime)
        self.assertFalse(self.runtime.reads)
        self.assertFalse(self.runtime.mutations)

    def test_systemd_resource_cannot_run_as_root_or_other_owner(self):
        for service_user in ("root", "", "0", "vsp"):
            with self.subTest(service_user=service_user):
                broken = copy.deepcopy(self.config)
                broken["resources"]["knaba-web"]["user"] = service_user
                with self.assertRaises(ValueError):
                    sitepanel.API(broken, self.ledger, self.runtime)
        self.assertFalse(self.runtime.mutations)

    def test_internal_failure_does_not_disclose_root_diagnostics(self):
        secret = "/root/private-config: secret-example-value"
        self.runtime.failure = RuntimeError(secret)
        result = self.request(KNABA, action())
        self.assert_error(result, "unavailable")
        self.assertNotIn(secret, json.dumps(result))
        self.assertNotIn("Traceback", json.dumps(result))


class RuntimeGuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="sitepanel-runtime-tests-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.own = self.root / "knaba"
        self.foreign = self.root / "vsp"
        self.own.mkdir()
        self.foreign.mkdir()
        self.immutable_id = "a" * 64
        self.resource = {
            "kind": "docker", "target": "knaba-web", "owner_uid": KNABA,
            "mount_roots": [str(self.own)],
            "required_labels": {"example.owner": "knaba"},
        }
        self.inspect = {
            "Id": self.immutable_id, "Name": "/knaba-web",
            "Config": {"Labels": {"example.owner": "knaba"}},
            "HostConfig": {"Privileged": False, "PidMode": "", "NetworkMode": "bridge",
                           "Devices": [], "CapAdd": []},
            "Mounts": [{"Type": "bind", "Source": str(self.own),
                        "Destination": "/app", "RW": True}],
            "State": {"Running": True},
        }
        self.runtime = sitepanel.Runtime()

    def assert_mutation_refused(self, inspect):
        mutations = []

        def command(argv, timeout=8):
            if "inspect" in argv:
                return json.dumps([inspect])
            mutations.append(argv)
            return ""

        with mock.patch.object(self.runtime, "command", side_effect=command):
            with self.assertRaises(sitepanel.Refused) as caught:
                self.runtime.perform(self.resource, "restart")
        self.assertEqual(caught.exception.code, "unsafe_resource")
        self.assertFalse(mutations, "An unsafe inspected container must never be mutated")

    def test_privileged_host_access_and_extra_capabilities_are_denied(self):
        cases = (("Privileged", True), ("NetworkMode", "host"), ("PidMode", "host"),
                 ("CapAdd", ["SYS_ADMIN"]),
                 ("Devices", [{"PathOnHost": "/dev/sda", "PathInContainer": "/dev/sda"}]))
        for key, value in cases:
            with self.subTest(setting=key):
                inspect = copy.deepcopy(self.inspect)
                inspect["HostConfig"][key] = value
                self.assert_mutation_refused(inspect)

    def test_foreign_mount_is_denied(self):
        self.inspect["Mounts"][0]["Source"] = str(self.foreign)
        self.assert_mutation_refused(self.inspect)

    def test_symlink_mount_cannot_escape_allowed_owner_directory(self):
        link = self.own / "escaped"
        link.symlink_to(self.foreign, target_is_directory=True)
        self.inspect["Mounts"][0]["Source"] = str(link)
        self.assert_mutation_refused(self.inspect)

    def test_similar_path_prefix_is_not_an_authorized_mount_root(self):
        sibling = self.root / "knaba-other-owner"
        sibling.mkdir()
        self.inspect["Mounts"][0]["Source"] = str(sibling)
        self.assert_mutation_refused(self.inspect)

    def test_unregistered_volume_mount_is_denied(self):
        self.inspect["Mounts"][0]["Type"] = "volume"
        self.assert_mutation_refused(self.inspect)

    def test_missing_required_ownership_label_is_denied(self):
        self.inspect["Config"]["Labels"] = {}
        self.assert_mutation_refused(self.inspect)

    def test_action_targets_inspected_id_despite_name_reassignment(self):
        replaced_id = "b" * 64
        names = {self.resource["target"]: self.immutable_id}
        acted_on = []

        def command(argv, timeout=8):
            if "inspect" in argv:
                snapshot = json.dumps([self.inspect])
                # Another container acquires this name between inspect and action.
                names[self.resource["target"]] = replaced_id
                return snapshot
            acted_on.append(names.get(argv[-1], argv[-1]))
            return ""

        with mock.patch.object(self.runtime, "command", side_effect=command):
            result = self.runtime.perform(self.resource, "restart")
        self.assertEqual(result["state"], "completed")
        self.assertEqual(acted_on, [self.immutable_id])
        self.assertNotIn(replaced_id, acted_on)

    def test_untrusted_backup_controller_never_executes(self):
        controller_dir = self.root / "tenant-writable"
        controller_dir.mkdir(mode=0o770)
        controller_dir.chmod(0o770)
        controller = controller_dir / "controller.py"
        controller.write_text("raise SystemExit('must not execute')\n")
        controller.chmod(0o600)
        resource = dict(self.resource, backup={
            "controller": str(controller), "environment": "production", "storage": str(self.root),
        })
        with mock.patch.object(self.runtime, "command") as command:
            with self.assertRaises(sitepanel.Refused) as caught:
                self.runtime.perform(resource, "backup")
        self.assertEqual(caught.exception.code, "unsafe_configuration")
        command.assert_not_called()

    def test_command_timeout_kills_isolated_process_group(self):
        # No real process, pid lookup or signal is used by this contract test.
        process = mock.MagicMock()
        process.pid = 424242
        process.returncode = 0
        process.__enter__.return_value = process
        process.communicate.side_effect = [
            subprocess.TimeoutExpired(["fake-controller"], 1), ("", ""),
        ]
        with mock.patch.object(sitepanel.subprocess, "Popen", return_value=process) as popen, \
                mock.patch.object(sitepanel.os, "killpg") as kill_group, \
                mock.patch.object(sitepanel.os, "getpgid", return_value=process.pid):
            with self.assertRaises(subprocess.TimeoutExpired):
                self.runtime.command(["fake-controller"], timeout=1)
        self.assertIs(popen.call_args.kwargs.get("start_new_session"), True,
                      "A root controller's child processes need their own process group")
        kill_group.assert_any_call(process.pid, signal.SIGKILL)

    def test_systemd_service_refuses_privileged_execution_hooks(self):
        unit = self.root / "knaba-web.service"
        resource = {"kind": "systemd", "target": unit.name,
                    "owner_uid": KNABA, "user": "knaba"}
        show = "ActiveState=active\nUser=knaba\nFragmentPath=" + str(unit) + "\nDropInPaths=\n"
        cases = (
            ("ordinary service", "PermissionsStartOnly = no\nExecStartPre=/usr/bin/true\n", False),
            ("spaced privileged setting", "  PermissionsStartOnly = yes  \n", True),
            ("privileged command prefix", "ExecStartPre=+/usr/bin/true\n", True),
        )
        for name, directives, refused in cases:
            with self.subTest(configuration=name):
                unit.write_text("[Service]\nUser=knaba\nExecStart=/usr/bin/true\n" + directives)
                # Ownership is covered separately; this test isolates unit parsing.
                with mock.patch.object(sitepanel, "trusted_file") as trust, \
                        mock.patch.object(self.runtime, "command", return_value=show):
                    if refused:
                        with self.assertRaises(sitepanel.Refused) as caught:
                            self.runtime.service_info(resource)
                        self.assertEqual(caught.exception.code, "unsafe_resource")
                    else:
                        info = self.runtime.service_info(resource)
                        self.assertEqual(info["User"], "knaba")
                        self.assertEqual(info["ActiveState"], "active")
                    trust.assert_any_call(str(unit))


class TrustedFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="sitepanel-trust-tests-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.owner_dir = self.root / "controller"
        self.owner_dir.mkdir(mode=0o700)
        self.controller = self.owner_dir / "controller.py"
        self.controller.write_text("# Temporary, never executed\n")
        self.controller.chmod(0o600)
        self.actual_lstat = Path.lstat
        self.tenant_owned = None

    def fixture_lstat(self, path, *args, **kwargs):
        """Keep real fixture modes/symlinks; simulate root ownership portably.

        The surrounding temporary-directory harness (e.g. /tmp) is treated as
        trusted so it cannot mask an error in the fixture path under test.
        No real ownership or host directory permissions are changed.
        """
        info = list(self.actual_lstat(path, *args, **kwargs))
        info[4] = VSP if path == self.tenant_owned else 0
        if path != self.root and self.root not in path.parents:
            info[0] &= ~0o022
        return os.stat_result(info)

    def trusted_check(self, path):
        with mock.patch.object(Path, "lstat", autospec=True, side_effect=self.fixture_lstat):
            sitepanel.trusted_file(str(path))

    def assert_untrusted(self, path):
        with self.assertRaises(sitepanel.Refused) as caught:
            self.trusted_check(path)
        self.assertEqual(caught.exception.code, "unsafe_configuration")

    def test_root_owned_nonwritable_fixture_is_accepted(self):
        self.trusted_check(self.controller)

    def test_tenant_writable_ancestor_is_denied(self):
        self.owner_dir.chmod(0o770)
        self.assert_untrusted(self.controller)

    def test_tenant_owned_readonly_ancestor_is_denied(self):
        self.owner_dir.chmod(0o500)
        self.addCleanup(self.owner_dir.chmod, 0o700)
        self.tenant_owned = self.owner_dir
        self.assert_untrusted(self.controller)

    def test_writable_controller_file_is_denied(self):
        self.controller.chmod(0o660)
        self.assert_untrusted(self.controller)

    def test_symlink_controller_is_denied(self):
        alias = self.owner_dir / "alias.py"
        alias.symlink_to(self.controller)
        self.assert_untrusted(alias)

    def test_symlink_ancestor_is_denied(self):
        alias = self.root / "alias"
        alias.symlink_to(self.owner_dir, target_is_directory=True)
        self.assert_untrusted(alias / self.controller.name)

    def test_relative_controller_path_is_denied(self):
        with self.assertRaises(sitepanel.Refused) as caught:
            sitepanel.trusted_file("controller.py")
        self.assertEqual(caught.exception.code, "unsafe_configuration")


if __name__ == "__main__":
    unittest.main()
