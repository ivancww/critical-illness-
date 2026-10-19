/**
 * Compose the final plan-comparison output. Keeping this boundary separate
 * makes the one-card layout testable against the rendered markup rather than
 * against a source-function substring.
 */
export function renderPlanComparisonLayout({ planCards = [], sharedPayoutCard = '' } = {}) {
  return `<section class="experience-grid" data-plan-comparison>${planCards.join('')}</section>${sharedPayoutCard}`;
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

export function renderBrochureAction(resource = null) {
  const reference = /^https:\/\//i.test(String(resource?.resourceReference || '')) ? resource.resourceReference : null;
  if (!reference) return '<span class="button subtle button--disabled" aria-disabled="true">產品小冊子（尚未配置）</span>';
  return `<a class="button subtle" href="${escapeAttribute(reference)}" target="_blank" rel="noopener">產品小冊子</a>`;
}
