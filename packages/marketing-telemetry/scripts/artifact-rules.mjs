import assert from 'node:assert/strict';

const bannedTerms = /\b(?:security|protection|secret|token|attack|bot|signature|authentication|authorization)\b/i;

/** Removes long payloads before checking identifiers and comments in shipped text. */
export function withoutEmbeddedPayload(source) {
  return source.replace(/(["'])[A-Za-z0-9+/=]{512,}\1/g, '$1$1');
}

/** Rejects release hints that are unnecessary in the consumer-facing artifact. */
export function assertNeutralArtifact(source, path) {
  const text = withoutEmbeddedPayload(source);
  assert.ok(!text.includes('/*') && !text.includes('*/'), `${path}: comments must be stripped`);
  assert.ok(!text.includes('sourceMappingURL'), `${path}: source map reference must be stripped`);
  assert.ok(!bannedTerms.test(text), `${path}: sensitive implementation terminology must stay out`);
}
