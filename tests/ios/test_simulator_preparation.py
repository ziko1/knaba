"""Simulator preparation protocol tests; no macOS, Swift or XCTest acceptance."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "simulator_preparation", ROOT / "erp/apps/mobile-ios/scripts/prepare-simulator.py")
simulator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(simulator)

SHA = "1" * 40
UDID = "38B71FE6-7CEF-4613-8717-45EBE5A111E4"
RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-26-5"
DEVICE_TYPE = "com.apple.CoreSimulator.SimDeviceType.iPhone-17"


def ready_inventory(**changes):
    return {"devices": {RUNTIME: [{"udid": UDID, "state": "Booted", "isAvailable": True,
                                  "deviceTypeIdentifier": DEVICE_TYPE, **changes}]}}


class Clock:
    def __init__(self):
        self.value = 1000.0

    def __call__(self):
        return self.value


class Commands:
    def __init__(self, clock, inventories=(), durations=None, fail=None):
        self.clock = clock
        self.inventories = list(inventories)
        self.durations = durations or {}
        self.fail = fail
        self.calls = []
        self.checkpoints = []

    def __call__(self, arguments, path, timeout):
        operation = arguments[3] if arguments[:3] == ["xcrun", "simctl", "list"] else arguments[2] if arguments[:2] == ["xcrun", "simctl"] else arguments[0]
        self.calls.append({"arguments": arguments, "path": path, "timeout": timeout, "operation": operation})
        receipt_path = path.parent / "simulator-preparation.json"
        self.checkpoints.append(json.loads(receipt_path.read_text()) if receipt_path.exists() else None)
        values = {
            "xcodebuild": "Xcode 26.6\nBuild version synthetic\n",
            "xcrun": "26.5\n",
            "runtimes": json.dumps({"runtimes": [{"identifier": RUNTIME, "version": "26.5", "isAvailable": True, "buildversion": "23F77"}]}),
            "devicetypes": json.dumps({"devicetypes": [{"identifier": DEVICE_TYPE, "name": "iPhone 17"}]}),
            "create": UDID + "\n", "boot": "", "bootstatus": "Finished\n",
        }
        if operation == "devices":
            value = self.inventories.pop(0) if self.inventories else ready_inventory()
            if isinstance(value, dict):
                value = json.dumps(value)
        else:
            value = values[operation]
        timed_out = value == "timeout" or self.fail == operation
        path.write_text("partial " + operation + " output\n" if timed_out else value)
        duration = timeout if timed_out else self.durations.get(operation, 1)
        self.clock.value += min(duration, timeout)
        if timed_out or duration > timeout:
            raise subprocess.TimeoutExpired(arguments, timeout)
        if value == "nonzero":
            raise RuntimeError("Simulator command failed; see " + path.name)
        return path.read_text().strip()


class SimulatorPreparationTests(unittest.TestCase):
    def prepare(self, directory, commands):
        with mock.patch("time.monotonic", commands.clock):
            return simulator.prepare(Path(directory), SHA, "26.6", "26.5", "iPhone 17", commands)

    def assert_one_boot(self, commands):
        for operation in ["create", "boot", "bootstatus"]:
            self.assertEqual(sum(c["operation"] == operation for c in commands.calls), 1)
        create = next(c["arguments"] for c in commands.calls if c["operation"] == "create")
        self.assertEqual(create[-2:], [DEVICE_TYPE, RUNTIME])

    def test_post_boot_inventory_timeout_recovers_without_recreating_or_rebooting(self):
        commands = Commands(Clock(), ["timeout", ready_inventory()])
        with tempfile.TemporaryDirectory() as directory:
            receipt = self.prepare(directory, commands)
            self.assertEqual(receipt["status"], "SIMULATOR_READY_XCTEST_NOT_RUN")
            self.assertEqual(receipt["xctestExecution"], "NOT_RUN")
            self.assertEqual(receipt["runtimeDownload"], "NOT_REQUESTED")
            self.assertEqual(receipt["deviceUdid"], UDID)
            calls = [c for c in commands.calls if c["operation"] == "devices"]
            self.assertEqual(len(calls), 2)
            self.assertNotEqual(calls[0]["path"], calls[1]["path"])
            self.assertEqual(calls[0]["path"].read_text(), "partial devices output\n")
            self.assertEqual(json.loads((Path(directory) / "simulator-devices-ready.json").read_text()), ready_inventory())
            statuses = [c["status"] for c in receipt["commands"] if c["arguments"][:4] == ["xcrun", "simctl", "list", "devices"]]
            self.assertEqual(statuses, ["TIMED_OUT", "COMPLETED"])
            self.assert_one_boot(commands)

    def test_repeated_inventory_timeout_exhausts_one_retry_and_retains_partial_logs(self):
        commands = Commands(Clock(), ["timeout", "timeout", ready_inventory()])
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(subprocess.TimeoutExpired):
                self.prepare(directory, commands)
            receipt = json.loads((Path(directory) / "simulator-preparation.json").read_text())
            self.assertEqual(receipt["status"], "FAILED_XCTEST_NOT_RUN")
            self.assertEqual(receipt["xctestExecution"], "NOT_RUN")
            self.assertEqual(receipt["runtimeIdentifier"], RUNTIME)
            calls = [c for c in commands.calls if c["operation"] == "devices"]
            self.assertEqual(len(calls), 2)
            self.assertEqual(len({c["path"] for c in calls}), 2)
            self.assertTrue(all(c["path"].read_text() == "partial devices output\n" for c in calls))
            self.assertNotIn("deviceState", receipt)
            self.assert_one_boot(commands)

    def test_invalid_inventory_is_not_retried_or_replaced_with_bootstatus_success(self):
        for inventory in ["{broken", [], {}, ready_inventory(state="Shutdown"),
                          ready_inventory(isAvailable=False), ready_inventory(udid="another-device"),
                          ready_inventory(deviceTypeIdentifier="com.apple.CoreSimulator.SimDeviceType.iPhone-16"),
                          {"devices": {"another-runtime": ready_inventory()["devices"][RUNTIME]}}]:
            with self.subTest(inventory=inventory), tempfile.TemporaryDirectory() as directory:
                raw = json.dumps(inventory) if isinstance(inventory, list) else inventory
                commands = Commands(Clock(), [raw, ready_inventory()])
                with self.assertRaises(ValueError):
                    self.prepare(directory, commands)
                self.assertEqual(sum(c["operation"] == "devices" for c in commands.calls), 1)
                receipt = json.loads((Path(directory) / "simulator-preparation.json").read_text())
                self.assertEqual(receipt["status"], "FAILED_XCTEST_NOT_RUN")

    def test_boot_timeout_is_not_retried_and_never_queries_ready_inventory(self):
        commands = Commands(Clock(), fail="boot")
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(subprocess.TimeoutExpired):
                self.prepare(directory, commands)
            self.assertEqual(sum(c["operation"] == "boot" for c in commands.calls), 1)
            self.assertFalse(any(c["operation"] in ["bootstatus", "devices"] for c in commands.calls))
            receipt = json.loads((Path(directory) / "simulator-preparation.json").read_text())
            self.assertEqual(receipt["status"], "FAILED_XCTEST_NOT_RUN")

    def test_invalid_retry_cannot_fall_back_to_prior_successful_bootstatus(self):
        commands = Commands(Clock(), ["timeout", ready_inventory(state="Shutdown"), ready_inventory()])
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                self.prepare(directory, commands)
            self.assertEqual(sum(c["operation"] == "devices" for c in commands.calls), 2)
            receipt = json.loads((Path(directory) / "simulator-preparation.json").read_text())
            self.assertEqual(receipt["status"], "FAILED_XCTEST_NOT_RUN")
            self.assertNotIn("deviceState", receipt)

    def test_nonzero_inventory_command_is_not_retried(self):
        commands = Commands(Clock(), ["nonzero", ready_inventory()])
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(RuntimeError):
                self.prepare(directory, commands)
            self.assertEqual(sum(c["operation"] == "devices" for c in commands.calls), 1)
            receipt = json.loads((Path(directory) / "simulator-preparation.json").read_text())
            self.assertEqual(receipt["status"], "FAILED_XCTEST_NOT_RUN")

    def test_deadline_caps_final_inventory_and_prevents_a_retry_after_budget_exhaustion(self):
        durations = {"xcodebuild": 30, "xcrun": 30, "runtimes": 30, "devicetypes": 30,
                     "create": 30, "boot": 90, "bootstatus": 150}
        clock = Clock()
        commands = Commands(clock, ["timeout", "timeout"], durations)
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises((RuntimeError, subprocess.TimeoutExpired)):
                self.prepare(directory, commands)
            receipt = json.loads((Path(directory) / "simulator-preparation.json").read_text())
            self.assertEqual(receipt["status"], "FAILED_XCTEST_NOT_RUN")
            self.assertLessEqual(receipt["preparationDeadlineSeconds"], 8 * 60)
            self.assertLessEqual(clock.value - 1000, receipt["preparationDeadlineSeconds"])
            calls = [c for c in commands.calls if c["operation"] == "devices"]
            self.assertEqual(len(calls), 1)
            self.assertLess(calls[0]["timeout"], 60)

    def test_checkpoint_exists_before_each_command_and_keeps_exact_identity_before_ready_probe(self):
        commands = Commands(Clock())
        with tempfile.TemporaryDirectory() as directory:
            self.prepare(directory, commands)
            self.assertTrue(all(commands.checkpoints))
            index = next(i for i, c in enumerate(commands.calls) if c["operation"] == "devices")
            receipt = commands.checkpoints[index]
            self.assertEqual(receipt["status"], "PREPARING")
            self.assertEqual(receipt["sourceGitSha"], SHA)
            self.assertEqual(receipt["runtimeIdentifier"], RUNTIME)
            self.assertEqual(receipt["deviceTypeIdentifier"], DEVICE_TYPE)
            self.assertEqual(receipt["deviceUdid"], UDID)
            self.assertEqual(receipt["commands"][-1]["status"], "RUNNING")

    def test_real_subprocess_timeout_preserves_partial_command_output(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "partial.log"
            with self.assertRaises(subprocess.TimeoutExpired):
                simulator.run([sys.executable, "-u", "-c", "import time; print('partial boot evidence', flush=True); time.sleep(10)"], output, 0.5)
            self.assertEqual(output.read_text(), "partial boot evidence\n")


if __name__ == "__main__":
    unittest.main()
