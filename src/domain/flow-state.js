export const FLOW_STEP_COUNT = 14;

export function createFlowState(initial = {}) {
  return {
    currentStep: Math.min(Math.max(Number(initial.currentStep) || 0, 0), FLOW_STEP_COUNT - 1),
    desiredMonths: Number(initial.desiredMonths) > 0 ? Number(initial.desiredMonths) : 12,
    monthlyNeed: Number(initial.monthlyNeed) > 0 ? Number(initial.monthlyNeed) : 30000,
    existingProtection: Number(initial.existingProtection) >= 0 ? Number(initial.existingProtection) : 0,
    existingProtectionSource: initial.existingProtectionSource || 'Manual',
    existingPolicyReferences: Array.isArray(initial.existingPolicyReferences) ? initial.existingPolicyReferences : [],
    concern: initial.concern || '',
    protectionStyle: initial.protectionStyle || 'compare',
    customMonths: Number(initial.customMonths) > 0 ? Number(initial.customMonths) : 12
  };
}

export function nextFlowStep(flow) {
  return { ...flow, currentStep: Math.min(FLOW_STEP_COUNT - 1, flow.currentStep + 1) };
}

export function previousFlowStep(flow) {
  return { ...flow, currentStep: Math.max(0, flow.currentStep - 1) };
}

export function togglePlanSelection(selectedPlanIds, planId) {
  return selectedPlanIds.includes(planId) ? selectedPlanIds.filter(id => id !== planId) : [...selectedPlanIds, planId];
}

export function calculateSupportReserve({ months, monthlyNeed }) {
  const safeMonths = Number(months);
  const safeMonthlyNeed = Number(monthlyNeed);
  if (!(safeMonths > 0) || !(safeMonthlyNeed > 0)) return 0;
  return safeMonths * safeMonthlyNeed;
}

export function translateProtectionToMonths({ existingProtection, monthlyNeed }) {
  const protection = Number(existingProtection);
  const need = Number(monthlyNeed);
  if (!(protection >= 0) || !(need > 0)) return 0;
  return protection / need;
}
