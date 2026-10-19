const SUPPORTED_RETURN_SURFACES = new Set(['user', 'admin']);
const AVA_ORIGIN = 'https://ivancww.github.io';

export function resolveAvaReturnContext({ referrer = '', currentUrl = '' } = {}) {
  if (!referrer || !currentUrl) return null;
  try {
    const context = new URL(referrer);
    const current = new URL(currentUrl);
    if (!['http:', 'https:'].includes(context.protocol) || context.origin !== AVA_ORIGIN || context.href === current.href) return null;
    if (!context.pathname.startsWith('/avaplatform/')) return null;

    // Mother Platform uses no avaSurface for Frontstage and explicit user/admin
    // surfaces when returning to the corresponding Platform directory.
    const surface = context.searchParams.get('avaSurface');
    if (surface && !SUPPORTED_RETURN_SURFACES.has(surface)) return null;
    return context.href;
  } catch {
    return null;
  }
}
