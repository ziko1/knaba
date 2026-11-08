#!/usr/bin/env python3
"""Boot a concrete installed iPhone runtime and retain real preparation evidence."""
import argparse
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import uuid


def select_runtime(inventory, version):
    found = [entry for entry in inventory.get("runtimes", [])
             if entry.get("version") == version and entry.get("isAvailable") is True
             and str(entry.get("identifier", "")).startswith("com.apple.CoreSimulator.SimRuntime.iOS-")]
    if len(found) != 1:
        raise ValueError("Exact available iOS runtime missing or ambiguous: " + version)
    return found[0]


def select_device_type(inventory, name):
    found = [entry for entry in inventory.get("devicetypes", [])
             if entry.get("name") == name and str(entry.get("identifier", "")).startswith("com.apple.CoreSimulator.SimDeviceType.iPhone-")]
    if len(found) != 1:
        raise ValueError("Exact iPhone device type missing or ambiguous: " + name)
    return found[0]


def verify_device(inventory, runtime, device_type, udid):
    found = [entry for entry in inventory.get("devices", {}).get(runtime, []) if entry.get("udid") == udid]
    if len(found) != 1 or found[0].get("state") != "Booted" or found[0].get("isAvailable") is not True or found[0].get("deviceTypeIdentifier") != device_type:
        raise ValueError("Created simulator is not booted under the requested OS/device type")
    return found[0]


def run(arguments, output, timeout=60):
    with output.open("wb") as log:
        result = subprocess.run(arguments, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
    if result.returncode:
        raise RuntimeError("Simulator command failed; see " + output.name)
    if output.stat().st_size > 2 * 1024 * 1024:
        raise RuntimeError("Simulator command output exceeded limit")
    return output.read_text(encoding="utf-8").strip()


def prepare(evidence, sha, xcode_version, os_version, device_name, runner=run):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Concrete source commit is required")
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,2}", xcode_version) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,2}", os_version):
        raise ValueError("Explicit numeric Xcode/iOS versions required")
    evidence.mkdir(parents=True, exist_ok=True)
    receipt = {"sourceGitSha": sha, "requestedXcode": xcode_version, "requestedOS": os_version,
               "requestedDevice": device_name, "hostArchitecture": platform.machine(), "status": "PREPARING",
               "runtimeDownload": "NOT_REQUESTED", "xctestExecution": "NOT_RUN", "physicalDeviceVerification": "NOT_RUN"}
    def execute(arguments, name, timeout=60):
        return runner(arguments, evidence / name, timeout)
    def inventory(kind, name):
        value = json.loads(execute(["xcrun", "simctl", "list", kind, "--json"], name))
        if not isinstance(value, dict):
            raise ValueError("Invalid simulator inventory")
        return value
    try:
        version = execute(["xcodebuild", "-version"], "xcode-version.txt")
        if version.splitlines()[0] != "Xcode " + xcode_version:
            raise ValueError("Selected Xcode differs from requested version")
        sdk = execute(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"], "simulator-sdk-version.txt")
        if sdk != os_version:
            raise ValueError("Selected iOS SDK differs from requested version")
        runtime = select_runtime(inventory("runtimes", "simulator-runtimes.json"), os_version)
        device_type = select_device_type(inventory("devicetypes", "simulator-device-types.json"), device_name)
        identifier = execute(["xcrun", "simctl", "create", "KNABA-" + sha[:12], device_type["identifier"], runtime["identifier"]], "simulator-created-udid.txt")
        uuid.UUID(identifier)
        receipt["deviceUdid"] = identifier
        execute(["xcrun", "simctl", "boot", identifier], "simulator-boot.log", 120)
        execute(["xcrun", "simctl", "bootstatus", identifier, "-b"], "simulator-boot-status.log", 300)
        device = verify_device(inventory("devices", "simulator-devices-ready.json"), runtime["identifier"], device_type["identifier"], identifier)
        receipt.update(status="SIMULATOR_READY_XCTEST_NOT_RUN", runtimeIdentifier=runtime["identifier"],
                       runtimeBuildVersion=runtime.get("buildversion"), deviceTypeIdentifier=device_type["identifier"], deviceState=device["state"])
        return receipt
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError, KeyError, IndexError) as error:
        receipt.update(status="FAILED_XCTEST_NOT_RUN", error=type(error).__name__ + ": " + str(error)[:400])
        raise
    finally:
        (evidence / "simulator-preparation.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--xcode-version", required=True)
    parser.add_argument("--os-version", required=True)
    parser.add_argument("--device-name", required=True)
    args = parser.parse_args()
    if platform.system() != "Darwin":
        raise SystemExit("BLOCKED_EXTERNAL: real simulator preparation requires macOS")
    receipt = prepare(args.evidence_dir, os.environ.get("NATIVE_SOURCE_SHA", ""), args.xcode_version, args.os_version, args.device_name)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("device_udid=" + receipt["deviceUdid"] + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    main()
