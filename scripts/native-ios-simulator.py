#!/usr/bin/env python3
"""Prepare one real iOS 18.5 simulator; never substitute another OS or fake XCTest.

Apple download command documentation:
https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components
All external commands have deadlines. JSON inventories and failure status are
retained even when Apple cannot supply the pinned runtime.
"""
import argparse
import json
import os
import pathlib
import platform
import re
import signal
import subprocess
import sys
import uuid

OS_VERSION = "18.5"
RUNTIME_PREFIX = "com.apple.CoreSimulator.SimRuntime.iOS-"
DEVICE_TYPE = "com.apple.CoreSimulator.SimDeviceType.iPhone-16"


def choose_runtime(inventory):
    candidates = [r for r in inventory.get("runtimes", [])
                  if r.get("version") == OS_VERSION
                  and str(r.get("identifier", "")).startswith(RUNTIME_PREFIX)
                  and r.get("isAvailable") is True]
    if len(candidates) > 1:
        raise RuntimeError("Ambiguous available iOS 18.5 runtimes; refusing to guess")
    return candidates[0] if candidates else None


def choose_device_type(inventory):
    candidates = [d for d in inventory.get("devicetypes", [])
                  if d.get("identifier") == DEVICE_TYPE and d.get("name") == "iPhone 16"]
    if len(candidates) != 1:
        raise RuntimeError("Pinned iPhone 16 device type is unavailable or ambiguous")
    return candidates[0]


def verify_device(inventory, runtime_identifier, device_udid):
    devices = inventory.get("devices", {}).get(runtime_identifier, [])
    matches = [d for d in devices if d.get("udid") == device_udid]
    if len(matches) != 1 or matches[0].get("isAvailable") is not True:
        raise RuntimeError("Created device is not available under the exact iOS 18.5 runtime")
    device = matches[0]
    if device.get("deviceTypeIdentifier") != DEVICE_TYPE or device.get("state") != "Booted":
        raise RuntimeError("Created iPhone 16 simulator did not reach Booted state")
    return device


def run_command(command, timeout_seconds, log_path):
    # A separate process group also bounds any download/boot child processes.
    with log_path.open("wb") as output:
        process = subprocess.Popen(command, stdout=output, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        try:
            return_code = process.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=10)
            raise RuntimeError(f"Command exceeded {timeout_seconds}s; see {log_path.name}")
    if return_code != 0:
        raise RuntimeError(f"Command exited {return_code}; see {log_path.name}")
    if log_path.stat().st_size > 4 * 1024 * 1024:
        # Download/boot logs need no in-memory parsing; callers ignore this value.
        return ""
    return log_path.read_text(encoding="utf-8", errors="replace").strip()


def prepare(evidence_dir, source_sha, runner=run_command, architecture=None):
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise RuntimeError("A concrete 40-character native source SHA is required")
    architecture = architecture or platform.machine()
    if architecture not in ("arm64", "x86_64"):
        raise RuntimeError("Unsupported simulator host architecture")
    evidence_dir.mkdir(parents=True, exist_ok=True)
    receipt = {"sourceGitSha": source_sha, "requestedOS": OS_VERSION,
               "requestedDevice": "iPhone 16", "hostArchitecture": architecture,
               "runtimeDownload": "NOT_NEEDED", "status": "PREPARING",
               "xctestExecution": "NOT_RUN", "physicalDeviceVerification": "NOT_RUN"}

    def command(arguments, name, timeout=60):
        return runner(arguments, timeout, evidence_dir / name)

    def inventory(kind, name):
        return json.loads(command(["xcrun", "simctl", "list", kind, "--json"], name))

    try:
        version = command(["xcodebuild", "-version"], "simulator-xcode-version.txt")
        if version.splitlines()[0] != "Xcode 16.4":
            raise RuntimeError("Simulator preparation requires exactly Xcode 16.4")
        sdk = command(["xcrun", "--sdk", "iphonesimulator18.5", "--show-sdk-version"],
                      "simulator-sdk-version.txt")
        if sdk != OS_VERSION:
            raise RuntimeError("Pinned iOS 18.5 simulator SDK is unavailable")
        runtime = choose_runtime(inventory("runtimes", "simulator-runtimes-before.json"))
        inventory("devices", "simulator-devices-before.json")
        if runtime is None:
            receipt["runtimeDownload"] = "REQUESTED_EXACT_18_5"
            variant = "arm64" if architecture == "arm64" else "universal"
            command(["xcodebuild", "-downloadPlatform", "iOS", "-buildVersion", OS_VERSION,
                     "-architectureVariant", variant], "simulator-runtime-install.log", 1200)
            receipt["runtimeDownload"] = "COMMAND_SUCCEEDED"
            runtime = choose_runtime(inventory("runtimes", "simulator-runtimes-after.json"))
        if runtime is None:
            raise RuntimeError("Apple did not make the exact iOS 18.5 runtime available")
        device_type = choose_device_type(inventory("devicetypes", "simulator-device-types.json"))
        runtime_identifier = runtime["identifier"]
        name = "KNABA-iOS-18.5-" + source_sha[:12]
        device_udid = command(["xcrun", "simctl", "create", name, device_type["identifier"],
                               runtime_identifier], "simulator-created-udid.txt")
        try:
            uuid.UUID(device_udid)
        except ValueError as error:
            raise RuntimeError("simctl did not return a concrete device UUID") from error
        command(["xcrun", "simctl", "boot", device_udid], "simulator-boot.log", 120)
        command(["xcrun", "simctl", "bootstatus", device_udid, "-b"],
                "simulator-boot-status.log", 300)
        device = verify_device(inventory("devices", "simulator-devices-ready.json"),
                               runtime_identifier, device_udid)
        receipt.update({"status": "SIMULATOR_READY_XCTEST_NOT_RUN",
                        "runtimeIdentifier": runtime_identifier,
                        "runtimeBuildVersion": runtime.get("buildversion"),
                        "deviceUdid": device_udid, "deviceState": device["state"]})
        return receipt
    except (RuntimeError, ValueError, KeyError, IndexError, OSError) as error:
        receipt.update({"status": "FAILED_XCTEST_NOT_RUN", "error": str(error)})
        raise
    finally:
        (evidence_dir / "simulator-preparation.json").write_text(
            json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-dir", type=pathlib.Path, required=True)
    args = parser.parse_args()
    if platform.system() != "Darwin":
        raise RuntimeError("Actual simulator preparation requires a macOS host")
    receipt = prepare(args.evidence_dir, os.environ.get("NATIVE_SOURCE_SHA", ""))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("device_udid=" + receipt["deviceUdid"] + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, KeyError, IndexError, OSError) as error:
        print("Simulator preparation failed: " + str(error), file=sys.stderr)
        sys.exit(1)
