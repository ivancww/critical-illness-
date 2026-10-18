/**
 * Compose the final plan-comparison output. Keeping this boundary separate
 * makes the one-card layout testable against the rendered markup rather than
 * against a source-function substring.
 */
export function renderPlanComparisonLayout({ planCards = [], sharedPayoutCard = '' } = {}) {
  return `<section class="experience-grid" data-plan-comparison>${planCards.join('')}</section>${sharedPayoutCard}`;
}
