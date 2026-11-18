import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

/**
 * Reads and validates the independently authored conversion-v1 fixtures.
 *
 * This check catches truncated fixtures, malformed state lanes and incorrect
 * temporal examples before the Rust and PHP implementations consume them.
 * It deliberately does not recalculate scores: differential score checks
 * belong to the Rust and PHP test suites.
 */
const fixtureUrl = new URL('../tests/fixtures/conversion-v1.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

assert.equal(fixture.profile, 'cv1', 'The only MVP profile must be cv1.');
assert.equal(fixture.constants.initial.length, 8, 'Exactly eight initial lanes are required.');
assert.equal(fixture.constants.multipliers.length, 8, 'Exactly eight multipliers are required.');
assert.equal(fixture.constants.additives.length, 8, 'Exactly eight additives are required.');
assert.deepEqual(
  [...fixture.constants.permutation].sort((a, b) => a - b),
  [0, 1, 2, 3, 4, 5, 6, 7],
  'The lane permutation must contain every lane exactly once.',
);
assert.equal(fixture.constants.substitution.length, 16, 'A nibble substitution table is required.');
assert.ok(Array.isArray(fixture.cases) && fixture.cases.length >= 6, 'At least six golden cases are required.');

const names = new Set();

for (const testCase of fixture.cases) {
  assert.ok(testCase.name, 'Every case needs a stable name.');
  assert.ok(!names.has(testCase.name), `Duplicate case name: ${testCase.name}.`);
  names.add(testCase.name);

  assert.match(testCase.score, /^[0-9a-f]{64}$/, `${testCase.name}: malformed score.`);
  assert.match(testCase.pulse, /^[0-9a-f]{16}$/, `${testCase.name}: malformed pulse.`);
  assert.equal(testCase.decodedTimestamp, testCase.selectedTimestamp, `${testCase.name}: pulse is not reversible.`);
  assert.equal(typeof testCase.expectedServerMatch, 'boolean', `${testCase.name}: missing server expectation.`);
  assert.equal(testCase.selectedTimestamp, testCase.now, `${testCase.name}: timestamp must use the exact request second.`);

  const pairs = JSON.parse(testCase.canonicalPropertiesJson);
  assert.ok(Array.isArray(pairs), `${testCase.name}: canonical properties must be an array.`);
  const propertyNames = new Set();
  let previousName = null;
  for (const pair of pairs) {
    assert.ok(Array.isArray(pair) && pair.length === 2, `${testCase.name}: malformed property pair.`);
    const [name, value] = pair;
    assert.match(name, /^[a-z0-9_.-]{1,64}$/, `${testCase.name}: invalid property name.`);
    assert.equal(typeof value, 'string', `${testCase.name}: property value must be a string.`);
    assert.ok(!propertyNames.has(name), `${testCase.name}: duplicate property name ${name}.`);
    propertyNames.add(name);
    if (previousName !== null) {
      assert.ok(previousName < name, `${testCase.name}: properties are not sorted.`);
    }
    previousName = name;
  }

  for (const stageName of ['journey', 'touchpoint', 'properties', 'pulse']) {
    const lanes = testCase.stages[stageName];
    assert.ok(Array.isArray(lanes) && lanes.length === 8, `${testCase.name}: ${stageName} needs eight lanes.`);
    for (const lane of lanes) {
      assert.match(lane, /^[0-9a-f]{8}$/, `${testCase.name}: malformed ${stageName} lane.`);
    }
  }
}

console.log(`conversion-v1: ${fixture.cases.length} golden cases validated.`);
