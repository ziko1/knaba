#!/usr/bin/env python3
"""Exercise the signature verifier against altered copies of the actual candidate bundle."""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import zipfile


def main():
    bundle = pathlib.Path(sys.argv[1]).resolve()
    certificate = sys.argv[2]
    verifier = pathlib.Path(__file__).with_name("VerifyAppBundle.java")
    java = shutil.which("java")
    if not java:
        raise RuntimeError("JDK 17 java is required")

    def verify(path, signer):
        return subprocess.run([java, str(verifier), str(path), signer], capture_output=True, text=True, timeout=30)

    positive = verify(bundle, certificate)
    if positive.returncode or json.loads(positive.stdout)["signature"] != "PASS":
        raise AssertionError("Original signed bundle was rejected")
    cases = ["original_signature"]
    wrong_certificate = "0" * 64 if certificate != "0" * 64 else "1" * 64
    if verify(bundle, wrong_certificate).returncode == 0:
        raise AssertionError("Wrong signer was accepted")
    cases.append("wrong_signer_rejected")
    with tempfile.TemporaryDirectory(prefix="knaba-aab-integrity-") as directory:
        for name in ("tampered_dex", "unsigned_extra", "missing_manifest"):
            altered = pathlib.Path(directory, name + ".aab")
            with zipfile.ZipFile(bundle) as source, zipfile.ZipFile(altered, "w") as target:
                for entry in source.infolist():
                    if name == "missing_manifest" and entry.filename == "base/manifest/AndroidManifest.xml":
                        continue
                    payload = source.read(entry)
                    if name == "tampered_dex" and entry.filename == "base/dex/classes.dex":
                        payload += b"\x00"
                    target.writestr(entry, payload)
                if name == "unsigned_extra":
                    target.writestr("base/assets/unsigned-probe.txt", b"synthetic integrity probe")
            if verify(altered, certificate).returncode == 0:
                raise AssertionError(name + " was accepted")
            cases.append(name + "_rejected")
    print(json.dumps({"appBundleIntegrity": "PASS", "cases": cases, "count": len(cases)}))


if __name__ == "__main__":
    main()
