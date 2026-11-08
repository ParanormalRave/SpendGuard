// Tests for src/notify/severity.ts
// Required exports:
//   type Severity = 'info' | 'warning' | 'critical'
//   severityRank(severity: Severity): number                 // info < warning < critical
//   shouldNotify(alertSeverity: Severity, minSeverity: Severity): boolean
//   shouldEmail(user: { emailEnabled: boolean; minSeverity: Severity }, alertSeverity: Severity): boolean
// Unknown severity strings must throw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { severityRank, shouldNotify, shouldEmail } from './severity';
import type { Severity } from './severity';

test('severity is ordered info, then warning, then critical', () => {
  assert.ok(severityRank('info') < severityRank('warning'));
  assert.ok(severityRank('warning') < severityRank('critical'));
});

test('shouldNotify compares the alert against the minimum', () => {
  const cases: Array<[Severity, Severity, boolean]> = [
    ['critical', 'warning', true],
    ['warning', 'warning', true],
    ['info', 'warning', false],
    ['info', 'info', true],
    ['critical', 'critical', true],
    ['warning', 'critical', false],
  ];
  for (const [alert, min, expected] of cases) {
    assert.equal(shouldNotify(alert, min), expected, `${alert} vs min ${min}`);
  }
});

test('shouldEmail is always false when email is switched off', () => {
  for (const severity of ['info', 'warning', 'critical'] as Severity[]) {
    assert.equal(shouldEmail({ emailEnabled: false, minSeverity: 'info' }, severity), false);
  }
});

test('shouldEmail follows minSeverity when email is on', () => {
  const user = { emailEnabled: true, minSeverity: 'warning' as Severity };
  assert.equal(shouldEmail(user, 'info'), false);
  assert.equal(shouldEmail(user, 'warning'), true);
  assert.equal(shouldEmail(user, 'critical'), true);
});

test('unknown severities throw', () => {
  assert.throws(() => severityRank('urgent' as unknown as Severity), Error);
  assert.throws(() => shouldNotify('urgent' as unknown as Severity, 'info'), Error);
});
