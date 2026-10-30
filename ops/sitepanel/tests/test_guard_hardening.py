"""Regression cases for overlapping resources and runtime coupling (offline)."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from test_sitepanel import KNABA, VSP, registry, sitepanel


DEPENDENCIES = (
    "Requires Requisite Wants BindsTo PartOf Conflicts ConflictedBy RequiredBy "
    "RequisiteOf WantedBy BoundBy ConsistsOf Upholds UpheldBy PropagatesStopTo "
    "StopPropagatedFrom PropagatesReloadTo ReloadPropagatedFrom OnFailure "
    "OnSuccess Triggers TriggeredBy JoinsNamespaceOf"
).split()


def safe_service(path):
    info = {key: "" for key in DEPENDENCIES}
    info.update(Id="knaba-web.service", Names="knaba-web.service",
                ActiveState="active", User="knaba", FragmentPath=str(path),
                DropInPaths="", Requires="-.mount sysinit.target system.slice",
                Wants="network-online.target tmp.mount -.mount",
                Conflicts="shutdown.target", WantedBy="multi-user.target",
                FailureAction="none", SuccessAction="none", StartLimitAction="none",
                JobTimeoutAction="none")
    return info


def show(info):
    return "\n".join(key + "=" + value for key, value in info.items()) + "\n"


class HardeningTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.unit = Path(self.tmp.name) / "knaba-web.service"
        self.unit.write_text("[Service]\nUser=knaba\nExecStart=/usr/bin/true\n")
        self.resource = registry()["resources"]["knaba-web"]
        self.runtime = sitepanel.Runtime()
        # Bound by API in production; the fixture sets the registry explicitly.
        self.runtime.resources = tuple(registry()["resources"].values())
        self.info = safe_service(self.unit)
        self.docker = {
            "Id": "a" * 64, "Name": "/knaba-web", "State": {"Running": True},
            "Config": {"Labels": {}}, "Mounts": [],
            "HostConfig": {"Privileged": False, "Devices": [], "CapAdd": [],
                           "PidMode": "", "IpcMode": "private", "UTSMode": "",
                           "UsernsMode": "", "CgroupnsMode": "private",
                           "NetworkMode": "own-private-bridge"},
        }

    def call_service(self, info, action="restart"):
        calls = []
        def command(argv, timeout=8):
            calls.append(argv)
            return show(info) if "show" in argv else ""
        with mock.patch.object(sitepanel, "trusted_file"), \
                mock.patch.object(self.runtime, "command", side_effect=command):
            result = self.runtime.perform(self.resource, action)
        return result, calls

    def refuse_service(self, info):
        calls = []
        def command(argv, timeout=8):
            calls.append(argv)
            return show(info) if "show" in argv else ""
        with mock.patch.object(sitepanel, "trusted_file"), \
                mock.patch.object(self.runtime, "command", side_effect=command):
            with self.assertRaises(sitepanel.Refused) as caught:
                self.runtime.perform(self.resource, "restart")
        self.assertEqual(caught.exception.code, "unsafe_resource")
        self.assertFalse([c for c in calls if "show" not in c])

    def test_duplicate_targets_are_rejected_even_with_same_owner(self):
        for kind in ("systemd", "docker"):
            for owner in (KNABA, VSP):
                with self.subTest(kind=kind, owner=owner):
                    config = registry()
                    original = config["resources"]["knaba-web"]
                    original["kind"] = kind
                    duplicate = dict(original, owner_uid=owner,
                                     user="knaba" if owner == KNABA else "vsp")
                    config["resources"]["duplicate"] = duplicate
                    with self.assertRaises(ValueError):
                        sitepanel.validate_config(config)

    def test_docker_name_and_id_aliases_never_receive_mutation(self):
        own = {"kind": "docker", "target": "knaba-web", "owner_uid": KNABA}
        for target in ("a" * 12, "a" * 64):
            with self.subTest(target=target):
                self.runtime.resources = (own, dict(own, target=target, owner_uid=VSP))
                with mock.patch.object(self.runtime, "command", return_value=json.dumps([self.docker])) as command:
                    with self.assertRaises(sitepanel.Refused):
                        self.runtime.perform(own, "restart")
                self.assertTrue(all("inspect" in c.args[0] for c in command.call_args_list))
        # Same alias in the other direction: own target is the immutable ID.
        own = dict(own, target="a" * 64)
        self.runtime.resources = (own, dict(own, target="knaba-web", owner_uid=VSP))
        with mock.patch.object(self.runtime, "command", return_value=json.dumps([self.docker])):
            with self.assertRaises(sitepanel.Refused):
                self.runtime.perform(own, "start")

    def test_shared_docker_namespaces_are_refused(self):
        own = {"kind": "docker", "target": "knaba-web", "owner_uid": KNABA}
        cases = {"PidMode": ("host", "container:foreign"),
                 "IpcMode": ("host", "shareable", "container:foreign"),
                 "NetworkMode": ("host", "container:foreign"),
                 "UTSMode": ("host",), "UsernsMode": ("host",),
                 "CgroupnsMode": ("host",)}
        for key, values in cases.items():
            for value in values:
                with self.subTest(key=key, value=value):
                    info = copy.deepcopy(self.docker)
                    info["HostConfig"][key] = value
                    with mock.patch.object(self.runtime, "command", return_value=json.dumps([info])) as command:
                        with self.assertRaises(sitepanel.Refused):
                            self.runtime.perform(own, "restart")
                    self.assertTrue(all("inspect" in c.args[0] for c in command.call_args_list))

    def test_private_docker_namespaces_and_named_bridge_remain_usable(self):
        own = {"kind": "docker", "target": "knaba-web", "owner_uid": KNABA}
        self.runtime.resources = (own,)
        with mock.patch.object(self.runtime, "command", return_value=json.dumps([self.docker])) as command:
            self.assertEqual(self.runtime.perform(own, "start")["state"], "completed")
        self.assertEqual(command.call_args_list[-1].args[0][-1], "a" * 64)

    def test_service_alias_collision_is_refused(self):
        self.info["Names"] += " vsp-web.service"
        self.refuse_service(self.info)

    def test_unexpected_resolved_unit_is_refused(self):
        self.info["Id"] = "vsp-web.service"
        self.info["Names"] = "vsp-web.service"
        self.refuse_service(self.info)

    def test_all_nonstandard_lifecycle_edges_are_refused_in_both_directions(self):
        for key in DEPENDENCIES:
            with self.subTest(property=key):
                info = copy.deepcopy(self.info)
                info[key] = "vsp-web.service"
                self.refuse_service(info)

    def test_unknown_intermediate_targets_and_mounts_are_refused(self):
        for key, value in (("Wants", "bridge-to-foreign.target"),
                           ("Requires", "srv-vsp.mount"),
                           ("ConsistsOf", "foreign-group.target"),
                           ("Conflicts", "network.target")):
            with self.subTest(property=key, target=value):
                info = dict(self.info, **{key: value})
                self.refuse_service(info)

    def test_missing_resolved_dependency_metadata_is_refused(self):
        info = dict(self.info)
        del info["BoundBy"]
        self.refuse_service(info)

    def test_host_wide_service_actions_are_refused(self):
        for key in ("FailureAction", "SuccessAction", "StartLimitAction", "JobTimeoutAction"):
            for value in ("reboot", "poweroff", "exit", "unknown-future-action"):
                with self.subTest(property=key, action=value):
                    self.refuse_service(dict(self.info, **{key: value}))

    def test_standard_boot_dependencies_remain_usable(self):
        result, calls = self.call_service(self.info)
        self.assertEqual(result["state"], "completed")
        self.assertEqual(calls[-1], ["/usr/bin/systemctl", "restart", "knaba-web.service"])

    def test_systemd_action_uses_checked_canonical_name(self):
        self.resource = dict(self.resource, target="knaba-alias.service")
        self.runtime.resources = (self.resource,)
        self.info["Names"] += " knaba-alias.service"
        _, calls = self.call_service(self.info)
        self.assertEqual(calls[-1][-1], "knaba-web.service")

    def test_real_runtime_is_bound_to_validated_registry(self):
        config = registry()
        api = sitepanel.API(config, Path(self.tmp.name) / "ledger.sqlite")
        self.assertEqual(tuple(api.runtime.resources), tuple(config["resources"].values()))
        supplied = sitepanel.Runtime()
        api = sitepanel.API(config, Path(self.tmp.name) / "ledger.sqlite", supplied)
        self.assertEqual(tuple(api.runtime.resources), tuple(config["resources"].values()))


if __name__ == "__main__":
    unittest.main()
