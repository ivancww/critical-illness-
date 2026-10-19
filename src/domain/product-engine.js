export function indexById(records = []) {
  return new Map(records.filter(Boolean).map(record => [record.plan_id ?? record.plan_key, record]));
}

export function getActivePlans(plans = []) {
  return plans.filter(plan => plan && plan.active !== false && plan.enabled !== false);
}

export function resolvePlan(plans, planId) {
  return plans.find(plan => (plan.plan_id ?? plan.plan_key) === planId) ?? null;
}

export function resolveBenefits(benefits, planId) {
  return benefits.filter(benefit => benefit.plan_id === planId && benefit.enabled !== false);
}

export function resolveClaimRules(rules, planId) {
  return rules.filter(rule => rule.plan_id === planId && rule.enabled !== false)
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
}
