// Presentation-only transaction. Customer scenario data remains outside the draft.
export const USER_KEY = 'AVA_CI_USER_STATE_V1';
const copy = value => JSON.parse(JSON.stringify(value));
export function createDraft(user) { return copy(user.pages || []); }
export function draftChanged(draft, saved) { return JSON.stringify(draft) !== JSON.stringify(saved); }
export function validatePages(pages) {
  if (!Array.isArray(pages) || pages.length > 100) throw new Error('自訂頁面數量無效。');
  const ids = new Set();
  for (const page of pages) {
    if (!page || typeof page.id !== 'string' || !page.id || ids.has(page.id)) throw new Error('頁面識別資料無效。');
    ids.add(page.id);
    if (!['content','image','video'].includes(page.type) || !['title','subtitle','content'].every(k => typeof page[k] === 'string' && page[k].length <= 10000) || typeof page.visible !== 'boolean' || !Array.isArray(page.media)) throw new Error('頁面資料無效。');
    if (page.media.length > (page.type === 'image' ? 6 : page.type === 'video' ? 1 : 0)) throw new Error('媒體數量超出限制。');
  }
  return true;
}
export function savePagesVerified({ storage, user, savedPages, draft, normalize }) {
  validatePages(draft);
  const oldRaw = storage.getItem(USER_KEY);
  const raw = oldRaw === null ? normalize(user) : JSON.parse(oldRaw);
  const current = normalize(raw);
  if (draftChanged(current.pages, savedPages)) throw new Error('本機頁面已在另一個視窗變更，請先備份並重新載入。');
  // Preserve the current customer/session fields and every legacy override.
  const prior = new Map(savedPages.map(p => [p.id, p]));
  const pages = draft.map((page, index) => {
    const original = prior.get(page.id);
    if (original) return { ...copy(original), title: page.title, subtitle: page.subtitle, content: page.content, visible: page.visible, sortOrder: index };
    if (page.media.length || Object.keys(page.overrides || {}).length) throw new Error('新增頁面包含未允許的資料。');
    return { id: page.id, type: page.type, title: page.title, subtitle: page.subtitle, content: page.content, visible: page.visible, sortOrder: index, flowPosition: index, createdAt: page.createdAt, updatedAt: page.updatedAt, overrides: {}, media: [] };
  });
  const candidate = { ...raw, pages };
  const encoded = JSON.stringify(candidate);
  let wrote = false;
  try {
    storage.setItem(USER_KEY, encoded); wrote = true;
    const actual = storage.getItem(USER_KEY);
    if (actual !== encoded) throw new Error('儲存後讀回不一致。');
    return JSON.parse(actual);
  } catch (error) {
    if (wrote) {
      try {
        // Do not overwrite a concurrent writer.
        if (storage.getItem(USER_KEY) === encoded) {
          if (oldRaw === null) storage.removeItem(USER_KEY); else storage.setItem(USER_KEY, oldRaw);
        }
      } catch { /* report failure and retain the draft */ }
    }
    throw error;
  }
}
