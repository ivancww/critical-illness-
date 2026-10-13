export function parseMoneyText(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

export function formatMoneyText(value) {
  const amount = parseMoneyText(value);
  return amount > 0 ? amount.toLocaleString('en-HK') : '';
}
