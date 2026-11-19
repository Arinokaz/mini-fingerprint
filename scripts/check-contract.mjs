import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

/** Validates fixture structure; implementations separately prove every score. */
async function validateFixture(profile) {
  const fixtureUrl = new URL(`../tests/fixtures/conversion-${profile.slice(1)}.json`, import.meta.url);
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const isV2 = profile === 'cv2';

  assert.equal(fixture.profile, profile);
  assert.equal(fixture.constants.initial.length, 8, 'Exactly eight initial lanes are required.');
  assert.equal(fixture.constants.multipliers.length, 8, 'Exactly eight multipliers are required.');
  assert.equal(fixture.constants.additives.length, 8, 'Exactly eight additives are required.');
  assert.deepEqual(
    [...fixture.constants.permutation].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
    'The lane permutation must contain every lane exactly once.',
  );
  assert.equal(fixture.constants.substitution.length, 16, 'A nibble substitution table is required.');
  if (isV2) {
    assert.equal(fixture.constants.domains.click, 'c1');
    assert.equal(fixture.constants.rounds.click, 4);
  }
  assert.ok(
    Array.isArray(fixture.cases) && fixture.cases.length >= (isV2 ? 4 : 6),
    `${profile}: insufficient golden cases.`,
  );

  const names = new Set();
  const stageNames = isV2
    ? ['journey', 'touchpoint', 'properties', 'click', 'pulse']
    : ['journey', 'touchpoint', 'properties', 'pulse'];

  for (const testCase of fixture.cases) {
    assert.ok(testCase.name, 'Every case needs a stable name.');
    assert.ok(!names.has(testCase.name), `Duplicate case name: ${testCase.name}.`);
    names.add(testCase.name);

    assert.match(testCase.score, /^[0-9a-f]{64}$/, `${testCase.name}: malformed score.`);
    assert.match(testCase.pulse, /^[0-9a-f]{16}$/, `${testCase.name}: malformed pulse.`);
    assert.equal(testCase.decodedTimestamp, testCase.selectedTimestamp, `${testCase.name}: pulse is not reversible.`);
    assert.equal(typeof testCase.expectedServerMatch, 'boolean', `${testCase.name}: missing server expectation.`);
    assert.equal(testCase.selectedTimestamp, testCase.now, `${testCase.name}: timestamp must use the exact request second.`);

    if (isV2) {
      assert.match(testCase.scorePrefix, /^0{0,3}$/, `${testCase.name}: unsupported score prefix.`);
      assert.match(testCase.initialClickId, /^[0-9a-f]{32}$/, `${testCase.name}: malformed initial clickId.`);
      assert.match(testCase.clickId, /^[0-9a-f]{32}$/, `${testCase.name}: malformed final clickId.`);
      assert.ok(Number.isSafeInteger(testCase.attempts) && testCase.attempts >= 1, `${testCase.name}: invalid attempts.`);
      assert.ok(testCase.score.startsWith(testCase.scorePrefix), `${testCase.name}: score misses its prefix.`);
    }

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

    for (const stageName of stageNames) {
      const lanes = testCase.stages[stageName];
      assert.ok(Array.isArray(lanes) && lanes.length === 8, `${testCase.name}: ${stageName} needs eight lanes.`);
      for (const lane of lanes) {
        assert.match(lane, /^[0-9a-f]{8}$/, `${testCase.name}: malformed ${stageName} lane.`);
      }
    }
  }

  console.log(`${profile}: ${fixture.cases.length} golden cases validated.`);
}

await validateFixture('cv1');
await validateFixture('cv2');

/** Проверяет структуру независимого product analytics профиля. */
async function validateProductAnalytics() {
  const fixture = JSON.parse(await readFile(
    new URL('../tests/fixtures/product-analytics-v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(fixture.profile, 'pa1');
  assert.equal(fixture.constants.initial.length, 4);
  assert.ok(Array.isArray(fixture.cases) && fixture.cases.length >= 4);
  const names = new Set();
  for (const testCase of fixture.cases) {
    assert.ok(testCase.name && !names.has(testCase.name));
    names.add(testCase.name);
    assert.match(testCase.score, /^[0-9a-f]{32}$/);
    assert.match(testCase.pulse, /^[0-9a-f]{16}$/);
    assert.match(testCase.viewId, /^[0-9a-f]{32}$/);
    assert.match(testCase.eventId, /^[0-9a-f]{32}$/);
    assert.equal(testCase.decodedTimestamp, testCase.timestamp);
    assert.equal(typeof testCase.expectedServerMatch, 'boolean');
    for (const stage of ['page', 'view', 'event', 'time']) {
      assert.ok(Array.isArray(testCase.frames[stage]) && testCase.frames[stage].length === 4);
      for (const lane of testCase.frames[stage]) {
        assert.match(lane, /^[0-9a-f]{8}$/);
      }
    }
  }
  console.log(`pa1: ${fixture.cases.length} golden cases validated.`);
}

await validateProductAnalytics();
