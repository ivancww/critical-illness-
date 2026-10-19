export const VERIFY_REGISTER = Object.freeze([
  'Premium matrix row mapping', 'Premium matrix column mapping', 'Smoker/non-smoker mapping',
  'Hidden premium precision', 'Premium rounding order', 'Monthly conversion factor/order',
  'Vitality application order', 'Current Vitality fee/reward/terms', 'Product IDs/codes where not officially established',
  'Protection end age', 'First-10-year enhancement eligibility', 'Exact first-10-year boundary',
  'Early CI contractual conditions', 'Child CI contractual conditions', 'Cancer eligibility conditions',
  'Cancer interval/waiting contractual wording', 'Heart/stroke contractual conditions',
  'Dementia/Parkinson qualifying conditions', 'Dementia/Parkinson payment timing', 'Official Firebase resource mappings'
]);

export function verificationState(message = '官方資料尚待核實。') {
  return { status: 'VERIFY', message };
}
