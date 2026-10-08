import {spawnSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';

// Each named case runs one CPU command-transport fixture. These are not XCTest.
function fixture(method: string) {
  const result = spawnSync('python3', [
    'tests/native_ios_simulator_test.py', `SimulatorInventoryTests.${method}`,
  ], {cwd: process.cwd(), encoding: 'utf8', timeout: 15_000});
  expect(result.error, result.error?.message).toBeUndefined();
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

describe('iOS simulator preparation CPU command-transport fixtures', () => {
  it('retains a real command deadline log and raises a typed timeout', () => {
    fixture('test_command_timeout_is_typed_and_retains_log');
  });
  it('retries one timed-out initial inventory and retains both attempted logs', () => {
    fixture('test_initial_inventory_timeout_then_exact_success');
  });
  it('fails without XCTest after two inventory timeouts', () => {
    fixture('test_repeated_inventory_timeout_stops_after_two_attempts');
  });
  it('does not retry a non-timeout inventory command failure', () => {
    fixture('test_non_timeout_inventory_failure_is_not_retried');
  });
  it('does not retry invalid inventory JSON', () => {
    fixture('test_invalid_inventory_json_is_not_retried');
  });
  it('recovers final inventory without replaying download, create or boot commands', () => {
    fixture('test_final_inventory_timeout_then_booted_success_does_not_replay_mutations');
  });
  it('rejects the wrong UUID or runtime after the final inventory retry', () => {
    fixture('test_final_inventory_retry_still_rejects_wrong_uuid_or_runtime');
  });
  it('rejects a device that is not Booted after the final inventory retry', () => {
    fixture('test_final_inventory_retry_still_rejects_not_booted');
  });
  it('never retries a timed-out mutating command', () => {
    fixture('test_mutating_command_timeouts_are_never_retried');
  });
});
