"""CPU guard/packaging regressions. These do not run Xcode or validate real Apple signing."""
import copy
import datetime as dt
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import plistlib
import stat
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


delivery = load("delivery", ROOT / "erp/apps/mobile-ios/scripts/distribution.py")
packager = load("packager", ROOT / "scripts/mobile/package-ios-source.py")
simulator = load("simulator", ROOT / "erp/apps/mobile-ios/scripts/prepare-simulator.py")

TEAM = "SYNTHETIC1"
BUNDLE = "de.knaba.mobile"


def export_options():
    return {"teamID": TEAM, "destination": "export", "method": "release-testing", "signingStyle": "manual",
            "manageAppVersionAndBuildNumber": False, "provisioningProfiles": {BUNDLE: "Synthetic test profile"}}


class ExportTests(unittest.TestCase):
    def test_explicit_local_manual_export_is_accepted(self):
        self.assertEqual(delivery.validate_export_options(export_options(), TEAM, BUNDLE), ("release-testing", "Synthetic test profile", "Apple Distribution"))

    def test_export_cannot_become_upload_or_provisioning(self):
        for change in ({"destination": "upload"}, {"destination": None}, {"signingStyle": "automatic"}, {"method": "enterprise"}, {"uploadSymbols": True}, {"uploadBitcode": True}, {"manageAppVersionAndBuildNumber": True}, {"thinning": "<thin-for-all-variants>"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.validate_export_options({**export_options(), **change}, TEAM, BUNDLE)

    def test_cross_team_or_bundle_export_is_rejected(self):
        for change in ({"teamID": "WRONGTEAM1"}, {"distributionBundleIdentifier": "de.other.app"}, {"provisioningProfiles": {"de.other.app": "Other profile"}}, {"provisioningProfiles": {BUNDLE: "unsafe\nprofile"}}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.validate_export_options({**export_options(), **change}, TEAM, BUNDLE)

    def profile(self):
        entitlements = {"application-identifier": TEAM + "." + BUNDLE, "com.apple.developer.team-identifier": TEAM,
                        "get-task-allow": False, "keychain-access-groups": [TEAM + "." + BUNDLE]}
        profile = {"ExpirationDate": dt.datetime(2030, 1, 1), "TeamIdentifier": [TEAM], "Platform": ["iOS"],
                   "ApplicationIdentifierPrefix": [TEAM], "ProvisionedDevices": ["synthetic-device-id"], "Entitlements": copy.deepcopy(entitlements)}
        return profile, entitlements

    def test_profile_expiration_team_entitlements_and_method_match(self):
        profile, entitlements = self.profile()
        receipt = delivery.validate_profile(profile, entitlements, TEAM, BUNDLE, "release-testing", now=dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc))
        self.assertEqual(receipt["registeredDeviceCount"], 1)
        self.assertTrue(receipt["entitlementsWithinProfile"])

    def test_profile_expiry_scope_and_unbounded_devices_fail_closed(self):
        for change in ({"ExpirationDate": dt.datetime(2020, 1, 1)}, {"TeamIdentifier": ["WRONGTEAM1"]}, {"ProvisionedDevices": []}, {"ProvisionsAllDevices": True}, {"Platform": ["macOS"]}, {"ApplicationIdentifierPrefix": ["WRONGPREFIX"]}):
            profile, entitlements = self.profile()
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.validate_profile({**profile, **change}, entitlements, TEAM, BUNDLE, "release-testing")

    def test_signed_entitlements_cannot_exceed_profile(self):
        profile, entitlements = self.profile()
        for change in ({"extra-private-entitlement": True}, {"application-identifier": TEAM + ".de.other"}, {"keychain-access-groups": ["OTHERTEAM.other"]}, {"get-task-allow": True}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.validate_profile(profile, {**entitlements, **change}, TEAM, BUNDLE, "release-testing")

    def test_device_and_store_profile_channels_remain_separate(self):
        profile, entitlements = self.profile()
        with self.assertRaises(ValueError):
            delivery.validate_profile(profile, entitlements, TEAM, BUNDLE, "app-store-connect")
        profile.pop("ProvisionedDevices")
        self.assertEqual(delivery.validate_profile(profile, entitlements, TEAM, BUNDLE, "app-store-connect")["registeredDeviceCount"], 0)

    def test_archive_traversal_and_symlinks_are_rejected(self):
        for name, mode in (("../escape", 0o100644), ("/absolute", 0o100644), ("Payload\\escape", 0o100644), ("Payload/link", stat.S_IFLNK | 0o777)):
            data = io.BytesIO()
            with zipfile.ZipFile(data, "w") as archive:
                archive.writestr("Payload/KNABADE.app/Info.plist", b"metadata")
                info = zipfile.ZipInfo(name)
                info.external_attr = mode << 16
                archive.writestr(info, b"target")
            with self.subTest(name=name), zipfile.ZipFile(data) as archive, self.assertRaises(ValueError):
                delivery.inspect_ipa_members(archive)


class SourcePackageTests(unittest.TestCase):
    def setUp(self):
        self.environment = mock.patch.dict(os.environ, {"NATIVE_SOURCE_SHA": ""})
        self.environment.start()
        self.temp = tempfile.TemporaryDirectory(prefix="knaba-ios-source-test-")
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        files = {
            "erp/apps/mobile-ios/Sources/Main.swift": "import Foundation\n",
            "erp/apps/mobile-ios/Resources/de.lproj/InfoPlist.strings": '"title" = "KNABA";\n',
            "erp/apps/mobile-ios/Tests/MainTests.swift": "import XCTest\n",
            "erp/apps/mobile-ios/scripts/build.sh": "#!/bin/bash\nexit 0\n",
            "erp/apps/mobile-ios/project.yml": (ROOT / "erp/apps/mobile-ios/project.yml").read_text(),
            "erp/apps/mobile-ios/Info.plist": "<plist/>\n",
            "erp/apps/mobile-ios/PrivacyInfo.xcprivacy": "<plist/>\n",
            "erp/tests/native-vectors.json": "[]\n",
            "scripts/mobile/package-ios-source.py": "# source packager fixture\n",
            ".github/workflows/ios.yml": "name: source fixture\n"
        }
        for relative, content in files.items():
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        self.git("init", "-q")
        self.git("add", ".")
        self.git("-c", "user.name=Synthetic test", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Synthetic fixture")

    def tearDown(self):
        self.temp.cleanup()
        self.environment.stop()

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True, text=True).stdout.strip()

    def test_clean_and_dirty_sources_have_accurate_provenance(self):
        clean = delivery.snapshot(self.root, require_clean=True)
        self.assertFalse(clean["sourceWorkingTree"])
        self.assertEqual(clean["sourceGitSha"], self.git("rev-parse", "HEAD"))
        (self.root / "erp/apps/mobile-ios/Sources/Main.swift").write_text("changed\n")
        dirty = delivery.snapshot(self.root)
        self.assertTrue(dirty["sourceWorkingTree"])
        self.assertNotEqual(dirty["inputSha256"], clean["inputSha256"])
        with self.assertRaises(ValueError):
            delivery.snapshot(self.root, require_clean=True)

    def test_untracked_native_input_is_not_attributed_to_clean_head(self):
        (self.root / "erp/apps/mobile-ios/Sources/New.swift").write_text("new\n")
        self.assertTrue(delivery.snapshot(self.root)["sourceWorkingTree"])
        with self.assertRaises(ValueError):
            delivery.snapshot(self.root, require_clean=True)

    def test_sensitive_file_or_symlink_never_enters_package(self):
        suspicious = self.root / "erp/apps/mobile-ios/Resources/signing.p12"
        suspicious.write_bytes(b"synthetic-not-a-key")
        with self.assertRaises(ValueError):
            delivery.source_paths(self.root)
        suspicious.unlink()
        suspicious = self.root / "erp/apps/mobile-ios/Sources/.hidden.swift"
        suspicious.write_text("unexpected input")
        with self.assertRaises(ValueError):
            delivery.source_paths(self.root)
        suspicious.unlink()
        suspicious = self.root / "erp/apps/mobile-ios/Resources/link.json"
        suspicious.symlink_to(self.root / "erp/tests/native-vectors.json")
        with self.assertRaises(ValueError):
            delivery.source_paths(self.root)

    def test_source_zip_is_reproducible_and_hashes_cover_actual_bytes(self):
        first, second = Path(self.temp.name) / "first-source.zip", Path(self.temp.name) / "second-source.zip"
        receipt = packager.package(first, self.root)
        self.assertEqual(receipt["type"], "XCODE_SOURCE_ONLY_NOT_IPA")
        self.assertEqual(packager.package(second, self.root)["sha256"], receipt["sha256"])
        with zipfile.ZipFile(first) as archive:
            self.assertIsNone(archive.testzip())
            manifest = json.loads(archive.read("IOS_SOURCE_MANIFEST.json"))
            for record in manifest["files"]:
                self.assertEqual(hashlib.sha256(archive.read(record["path"])).hexdigest(), record["sha256"])
            self.assertFalse(any(name.endswith((".ipa", ".p12", ".mobileprovision")) for name in archive.namelist()))
            extracted = Path(self.temp.name) / "source-extracted"
            archive.extractall(extracted)
        verified = delivery.snapshot(extracted, require_clean=True)
        self.assertEqual(verified["inputSha256"], manifest["inputSha256"])
        self.assertEqual(verified["provenance"], "VERIFIED_SOURCE_ARCHIVE")

    def test_source_manifest_cannot_bless_tampered_extracted_files(self):
        archive_path = Path(self.temp.name) / "native-source.zip"
        packager.package(archive_path, self.root)
        extracted = Path(self.temp.name) / "extracted"
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(extracted)
        (extracted / "erp/apps/mobile-ios/Sources/Main.swift").write_text("tampered\n")
        with self.assertRaises(ValueError):
            delivery.snapshot(extracted, require_clean=True)

    def test_tar_sources_are_reproducible_and_modes_preserved(self):
        first, second = Path(self.temp.name) / "first-source.tar.gz", Path(self.temp.name) / "second-source.tar.gz"
        self.assertEqual(packager.package(first, self.root)["sha256"], packager.package(second, self.root)["sha256"])
        with tarfile.open(first, "r:gz") as archive:
            for entry in archive.getmembers():
                self.assertEqual(entry.mtime, 0)
                self.assertFalse(entry.issym() or entry.islnk())
            self.assertIn("IOS_SOURCE_MANIFEST.json", archive.getnames())

    def test_sources_cannot_be_mislabeled_as_installable_ipa(self):
        for name in ("knaba.ipa", "native.zip", "source.app"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                packager.package(Path(self.temp.name) / name, self.root)

    def test_output_cannot_become_an_unrecorded_build_input(self):
        with self.assertRaises(ValueError):
            packager.package(self.root / 'erp/apps/mobile-ios/Resources/source.zip', self.root)


class SimulatorReceiptTests(unittest.TestCase):
    def setup_values(self):
        preparation = {"status": "SIMULATOR_READY_XCTEST_NOT_RUN", "deviceUdid": "synthetic-device", "requestedOS": "26.5"}
        summary = {"result": "Passed", "totalTestCount": 3, "passedTests": 3, "failedTests": 0, "skippedTests": 0, "expectedFailures": 0,
                   "devicesAndConfigurations": [{"device": {"deviceId": "synthetic-device", "osVersion": "26.5", "platform": "iOS Simulator"}}]}
        return summary, preparation

    def test_completed_native_summary_is_accepted_at_exact_destination(self):
        summary, preparation = self.setup_values()
        self.assertEqual(delivery.validate_xctest(summary, preparation)["passed"], 3)

    def test_no_tests_skipped_or_expected_failures_cannot_be_pass(self):
        summary, preparation = self.setup_values()
        for change in ({"totalTestCount": 0, "passedTests": 0}, {"failedTests": 1}, {"skippedTests": 1}, {"expectedFailures": 1}, {"result": "Failed"}, {"passedTests": 2}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.validate_xctest({**summary, **change}, preparation)

    def test_other_device_os_or_platform_cannot_reuse_receipt(self):
        summary, preparation = self.setup_values()
        for change in ({"deviceId": "other-device"}, {"osVersion": "18.5"}, {"platform": "iOS"}):
            changed = copy.deepcopy(summary)
            changed["devicesAndConfigurations"][0]["device"].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                delivery.validate_xctest(changed, preparation)

    def test_runtime_selection_requires_exact_unique_available_ios(self):
        runtime = {"identifier": "com.apple.CoreSimulator.SimRuntime.iOS-26-5", "version": "26.5", "isAvailable": True}
        self.assertEqual(simulator.select_runtime({"runtimes": [runtime]}, "26.5"), runtime)
        for values in ([], [runtime, runtime], [{**runtime, "isAvailable": False}], [{**runtime, "version": "18.5"}]):
            with self.subTest(values=values), self.assertRaises(ValueError):
                simulator.select_runtime({"runtimes": values}, "26.5")

    def test_preparation_failure_keeps_not_run_receipt_and_does_not_download(self):
        calls = []
        def wrong_version(arguments, path, timeout):
            calls.append(arguments)
            path.write_text("Xcode 16.4\nBuild version synthetic\n")
            return path.read_text()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                simulator.prepare(Path(directory), "1" * 40, "26.6", "26.5", "iPhone 17", wrong_version)
            receipt = json.loads((Path(directory) / "simulator-preparation.json").read_text())
            self.assertEqual(receipt["status"], "FAILED_XCTEST_NOT_RUN")
            self.assertEqual(receipt["runtimeDownload"], "NOT_REQUESTED")
            self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
