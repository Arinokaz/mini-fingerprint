import assert from 'node:assert/strict';

const bannedTerms = /(?:security|protection|secret|token|attack|bot|signature|authentication|authorization|nonce|challenge|proofofwork|mining|getrandomvalues)/i;

/** Исключает длинные base64-литералы, чтобы случайные символы payload не влияли на поиск. */
export function withoutEmbeddedPayload(source) {
  return source.replace(/(["'])[A-Za-z0-9+/=]{512,}\1/g, '$1$1');
}

/**
 * Отклоняет комментарии, source maps и термины, раскрывающие внутреннее назначение.
 * Проверяются JS и declarations после удаления base64-литералов.
 */
export function assertNeutralArtifact(source, path) {
  const text = withoutEmbeddedPayload(source).replace(/\bInjectionToken\b/g, '');
  assert.ok(!text.includes('/*') && !text.includes('*/'), `${path}: comments must be stripped`);
  assert.ok(!text.includes('sourceMappingURL'), `${path}: source map reference must be stripped`);
  assert.ok(!bannedTerms.test(text), `${path}: sensitive implementation terminology must stay out`);
}
