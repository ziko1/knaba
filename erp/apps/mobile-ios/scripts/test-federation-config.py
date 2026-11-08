#!/usr/bin/env python3
"""Portable negative tests of the configuration checker, not Swift execution."""
import copy
import importlib.util
import plistlib
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('federation_config', Path(__file__).with_name('verify-federation-config.py'))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

class FederationConfigurationTests(unittest.TestCase):
    def settings(self, configuration):
        return [{'target': 'KNABADE', 'buildSettings': {'CONFIGURATION': configuration,
            'SWIFT_ACTIVE_COMPILATION_CONDITIONS': 'DEBUG KNABA_FEDERATION_TEST' if configuration == 'Debug' else '',
            'INFOPLIST_FILE': 'Info.Debug.plist' if configuration == 'Debug' else 'Info.plist',
            'PRODUCT_BUNDLE_IDENTIFIER': 'de.knaba.mobile', 'IPHONEOS_DEPLOYMENT_TARGET': '17.0',
            'MARKETING_VERSION': '0.5.0', 'CURRENT_PROJECT_VERSION': '8'}}]
    def test_current_source_plists_have_only_the_debug_callback_delta(self):
        checker.check_plists(plistlib.loads((checker.ROOT/'Info.plist').read_bytes()), plistlib.loads((checker.ROOT/'Info.Debug.plist').read_bytes()))
    def test_synthetic_resolved_debug_and_release_settings_are_accepted(self):
        for config in ['Debug', 'Release']: checker.check_settings(self.settings(config), config)
    def test_release_test_or_debug_compilation_condition_is_rejected(self):
        for condition in ['DEBUG', 'KNABA_FEDERATION_TEST']:
            value = self.settings('Release'); value[0]['buildSettings']['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = condition
            with self.assertRaises(ValueError): checker.check_settings(value, 'Release')
    def test_release_debug_plist_or_other_file_is_rejected(self):
        for path in ['Info.Debug.plist', 'other.plist']:
            value = self.settings('Release'); value[0]['buildSettings']['INFOPLIST_FILE'] = path
            with self.assertRaises(ValueError): checker.check_settings(value, 'Release')
    def test_debug_without_both_conditions_is_rejected(self):
        for condition in ['', 'DEBUG', 'KNABA_FEDERATION_TEST']:
            value = self.settings('Debug'); value[0]['buildSettings']['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = condition
            with self.assertRaises(ValueError): checker.check_settings(value, 'Debug')
    def test_duplicate_target_or_changed_bundle_minimum_version_is_rejected(self):
        value = self.settings('Debug')
        with self.assertRaises(ValueError): checker.check_settings(value+value, 'Debug')
        for key in ['PRODUCT_BUNDLE_IDENTIFIER', 'IPHONEOS_DEPLOYMENT_TARGET', 'MARKETING_VERSION', 'CURRENT_PROJECT_VERSION']:
            altered = copy.deepcopy(value); altered[0]['buildSettings'][key] = 'changed'
            with self.assertRaises(ValueError): checker.check_settings(altered, 'Debug')
    def test_callback_in_release_or_changed_privacy_key_is_rejected(self):
        base = plistlib.loads((checker.ROOT/'Info.plist').read_bytes()); debug = plistlib.loads((checker.ROOT/'Info.Debug.plist').read_bytes())
        with self.assertRaises(ValueError): checker.check_plists({**base, 'CFBundleURLTypes': checker.CALLBACK}, debug)
        with self.assertRaises(ValueError): checker.check_plists(base, {**debug, 'UIBackgroundModes': []})
    def test_synthetic_compiled_debug_product_must_match_identity_and_callback(self):
        value = {'CFBundleURLTypes': checker.CALLBACK, 'CFBundleIdentifier': 'de.knaba.mobile', 'CFBundleVersion': '8',
                 'CFBundleShortVersionString': '0.5.0', 'MinimumOSVersion': '17.0'}
        checker.check_product(value)
        for key in value:
            changed = copy.deepcopy(value); changed.pop(key)
            with self.assertRaises(ValueError): checker.check_product(changed)

if __name__ == '__main__':
    unittest.main()
