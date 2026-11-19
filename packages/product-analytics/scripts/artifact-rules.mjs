import assert from 'node:assert/strict';

const bannedTerms = /(?:risk|security|protection|secret|token|attack|bot|human|signature|authentication|authorization|nonce|challenge|proofofwork|mining|headless|getrandomvalues)/i;

/** Исключает длинные base64-литералы из текстового сканирования. */
export function withoutEmbeddedPayload(source) {
  return source.replace(/(["'])[A-Za-z0-9+/=]{512,}\1/g, '$1$1');
}

/** Запрещает comments, source maps и раскрывающие назначение термины. */
export function assertNeutralArtifact(source, path) {
  const text = withoutEmbeddedPayload(source).replace(/\bInjectionToken\b/g, '');
  assert.ok(!text.includes('/*') && !text.includes('*/'), `${path}: comments must be stripped`);
  assert.ok(!text.includes('sourceMappingURL'), `${path}: source map reference must be stripped`);
  assert.ok(!bannedTerms.test(text), `${path}: sensitive implementation terminology must stay out`);
}
