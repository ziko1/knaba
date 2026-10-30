#!/usr/bin/env python3
"""CPU command-transport fixtures for simulator preparation, never real XCTest."""
import importlib.util
import json
import pathlib
import re
import sys
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "native_ios_simulator", ROOT / "scripts" / "native-ios-simulator.py")
simulator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(simulator)

SOURCE_SHA = "a" * 40
RUNTIME_ID = "com.apple.CoreSimulator.SimRuntime.iOS-18-5"
DEVICE_UDID = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE"


def ready_inventory(udid=DEVICE_UDID, state="Booted", runtime=RUNTIME_ID):
    return {"devices": {runtime: [{"udid": udid, "state": state,
                                 "isAvailable": True,
                                 "deviceTypeIdentifier": simulator.DEVICE_TYPE}]}}


class FixtureRunner:
    """Write distinct attempted logs and control only external command results."""
    def __init__(self, faults=None, ready=None, missing_runtime=False):
        self.faults = {name: list(outcomes) for name, outcomes in (faults or {}).items()}
        self.ready = ready if ready is not None else ready_inventory()
        self.missing_runtime = missing_runtime
        self.calls = []

    def calls_for(self, name):
        return [call for call in self.calls if call["name"] == name]

    def __call__(self, command, timeout_seconds, log_path):
        name = re.sub(r"\.attempt-[12](?=\.[^.]+$)", "", log_path.name)
        self.calls.append({"command": list(command), "timeoutSeconds": timeout_seconds,
                           "name": name, "log": log_path.name})
        outcomes = self.faults.get(name, [])
        outcome = outcomes.pop(0) if outcomes else "success"
        if outcome == "timeout":
            log_path.write_text("controlled partial output before timeout\n", encoding="utf-8")
            raise simulator.CommandTimeout(timeout_seconds, log_path)
        if outcome == "failure":
            log_path.write_text("controlled command exit 1\n", encoding="utf-8")
            raise RuntimeError(f"Command exited 1; see {log_path.name}")
        if outcome == "invalid-json":
            result = "{incomplete"
        elif command == ["xcodebuild", "-version"]:
            result = "Xcode 16.4\nBuild version 16F6"
        elif command == ["xcrun", "--sdk", "iphonesimulator18.5", "--show-sdk-version"]:
            result = "18.5"
        elif command[:3] == ["xcrun", "simctl", "list"]:
            kind = command[3]
            if kind == "runtimes":
                runtimes = [] if self.missing_runtime and name.endswith("before.json") else [
                    {"identifier": RUNTIME_ID, "version": "18.5", "buildversion": "22F77",
                     "isAvailable": True}]
                result = json.dumps({"runtimes": runtimes})
            elif kind == "devicetypes":
                result = json.dumps({"devicetypes": [{"identifier": simulator.DEVICE_TYPE,
                                                       "name": "iPhone 16"}]})
            elif kind == "devices":
                result = json.dumps(self.ready if name.endswith("ready.json") else {"devices": {}})
            else:
                raise AssertionError(f"Unexpected inventory kind: {kind}")
        elif command[:3] == ["xcrun", "simctl", "create"]:
            result = DEVICE_UDID
        elif command[:3] in (["xcrun", "simctl", "boot"], ["xcrun", "simctl", "bootstatus"]):
            result = "controlled boot command success"
        elif command[:3] == ["xcodebuild", "-downloadPlatform", "iOS"]:
            result = "controlled exact runtime download success"
        else:
            raise AssertionError(f"Unexpected command: {command}")
        log_path.write_text(result + "\n", encoding="utf-8")
        return result


class SimulatorInventoryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="knaba-simulator-fixture-")
        self.evidence = pathlib.Path(self.directory.name)
        self.addCleanup(self.directory.cleanup)

    def prepare(self, runner):
        return simulator.prepare(self.evidence, SOURCE_SHA, runner, architecture="arm64")

    def receipt(self):
        return json.loads((self.evidence / "simulator-preparation.json").read_text(encoding="utf-8"))

    def assert_failed_without_xctest(self):
        receipt = self.receipt()
        self.assertEqual(receipt["status"], "FAILED_XCTEST_NOT_RUN")
        self.assertEqual(receipt["xctestExecution"], "NOT_RUN")
        self.assertEqual(receipt["physicalDeviceVerification"], "NOT_RUN")
        return receipt

    def assert_inventory_attempts(self, runner, canonical_name, outcomes):
        calls = runner.calls_for(canonical_name)
        self.assertEqual(len(calls), len(outcomes))
        self.assertEqual([call["timeoutSeconds"] for call in calls], [60] * len(outcomes))
        self.assertTrue(all(call["command"][:3] == ["xcrun", "simctl", "list"] for call in calls))
        entries = [entry for entry in self.receipt()["inventoryAttempts"]
                   if entry["canonicalLog"] == canonical_name]
        self.assertEqual([entry["attempt"] for entry in entries], list(range(1, len(outcomes) + 1)))
        self.assertEqual([entry["outcome"] for entry in entries], outcomes)
        self.assertEqual([entry["log"] for entry in entries], [call["log"] for call in calls])
        self.assertTrue(all((self.evidence / entry["log"]).is_file() for entry in entries))

    def test_command_timeout_is_typed_and_retains_log(self):
        log = self.evidence / "deadline.log"
        with self.assertRaises(simulator.CommandTimeout) as raised:
            simulator.run_command([sys.executable, "-c", "import time; time.sleep(5)"], 0.2, log)
        self.assertEqual(raised.exception.timeout_seconds, 0.2)
        self.assertEqual(raised.exception.log_path, log)
        self.assertTrue(log.is_file())

    def test_initial_inventory_timeout_then_exact_success(self):
        name = "simulator-runtimes-before.json"
        runner = FixtureRunner({name: ["timeout", "success"]})
        receipt = self.prepare(runner)
        self.assertEqual(receipt["status"], "SIMULATOR_READY_XCTEST_NOT_RUN")
        self.assertEqual(receipt["runtimeIdentifier"], RUNTIME_ID)
        self.assertEqual(receipt["deviceUdid"], DEVICE_UDID)
        self.assertEqual(receipt["deviceState"], "Booted")
        self.assertEqual(receipt["xctestExecution"], "NOT_RUN")
        self.assert_inventory_attempts(runner, name, ["TIMED_OUT", "SUCCEEDED"])
        first, second = runner.calls_for(name)
        self.assertIn("partial output", (self.evidence / first["log"]).read_text(encoding="utf-8"))
        self.assertEqual((self.evidence / name).read_bytes(),
                         (self.evidence / second["log"]).read_bytes())

    def test_repeated_inventory_timeout_stops_after_two_attempts(self):
        name = "simulator-runtimes-before.json"
        runner = FixtureRunner({name: ["timeout", "timeout", "success"]})
        with self.assertRaises(simulator.CommandTimeout):
            self.prepare(runner)
        self.assert_failed_without_xctest()
        self.assert_inventory_attempts(runner, name, ["TIMED_OUT", "TIMED_OUT"])
        self.assertEqual(runner.calls_for("simulator-created-udid.txt"), [])
        self.assertFalse((self.evidence / name).exists())

    def test_non_timeout_inventory_failure_is_not_retried(self):
        name = "simulator-runtimes-before.json"
        runner = FixtureRunner({name: ["failure", "success"]})
        with self.assertRaisesRegex(RuntimeError, "Command exited 1"):
            self.prepare(runner)
        self.assert_failed_without_xctest()
        self.assert_inventory_attempts(runner, name, ["COMMAND_FAILED"])
        self.assertEqual(runner.calls_for("simulator-created-udid.txt"), [])

    def test_invalid_inventory_json_is_not_retried(self):
        name = "simulator-runtimes-before.json"
        runner = FixtureRunner({name: ["invalid-json", "success"]})
        with self.assertRaises(json.JSONDecodeError):
            self.prepare(runner)
        self.assert_failed_without_xctest()
        self.assert_inventory_attempts(runner, name, ["INVALID_JSON"])
        self.assertEqual(runner.calls_for("simulator-created-udid.txt"), [])

    def test_final_inventory_timeout_then_booted_success_does_not_replay_mutations(self):
        name = "simulator-devices-ready.json"
        runner = FixtureRunner({name: ["timeout", "success"]}, missing_runtime=True)
        receipt = self.prepare(runner)
        self.assertEqual(receipt["status"], "SIMULATOR_READY_XCTEST_NOT_RUN")
        self.assertEqual(receipt["deviceState"], "Booted")
        self.assert_inventory_attempts(runner, name, ["TIMED_OUT", "SUCCEEDED"])
        for mutation in ("simulator-runtime-install.log", "simulator-created-udid.txt",
                         "simulator-boot.log", "simulator-boot-status.log"):
            self.assertEqual(len(runner.calls_for(mutation)), 1, mutation)

    def test_final_inventory_retry_still_rejects_wrong_uuid_or_runtime(self):
        name = "simulator-devices-ready.json"
        for invalid in (ready_inventory(udid="FFFFFFFF-BBBB-4CCC-8DDD-EEEEEEEEEEEE"),
                        ready_inventory(runtime="com.apple.CoreSimulator.SimRuntime.iOS-18-4")):
            with self.subTest(inventory=invalid):
                runner = FixtureRunner({name: ["timeout", "success"]}, ready=invalid)
                with self.assertRaisesRegex(RuntimeError, "exact iOS 18.5 runtime"):
                    self.prepare(runner)
                self.assert_failed_without_xctest()
                self.assert_inventory_attempts(runner, name, ["TIMED_OUT", "SUCCEEDED"])
                self.assertEqual(len(runner.calls_for("simulator-created-udid.txt")), 1)

    def test_final_inventory_retry_still_rejects_not_booted(self):
        name = "simulator-devices-ready.json"
        runner = FixtureRunner({name: ["timeout", "success"]}, ready=ready_inventory(state="Shutdown"))
        with self.assertRaisesRegex(RuntimeError, "did not reach Booted state"):
            self.prepare(runner)
        self.assert_failed_without_xctest()
        self.assert_inventory_attempts(runner, name, ["TIMED_OUT", "SUCCEEDED"])
        self.assertEqual(len(runner.calls_for("simulator-boot.log")), 1)
        self.assertEqual(len(runner.calls_for("simulator-boot-status.log")), 1)

    def test_mutating_command_timeouts_are_never_retried(self):
        for name in ("simulator-runtime-install.log", "simulator-created-udid.txt",
                     "simulator-boot.log", "simulator-boot-status.log"):
            with self.subTest(command_log=name):
                runner = FixtureRunner({name: ["timeout", "success"]}, missing_runtime=True)
                with self.assertRaises(simulator.CommandTimeout):
                    self.prepare(runner)
                self.assert_failed_without_xctest()
                self.assertEqual(len(runner.calls_for(name)), 1)
                self.assertEqual(runner.calls_for("simulator-devices-ready.json"), [])


if __name__ == "__main__":
    unittest.main()
