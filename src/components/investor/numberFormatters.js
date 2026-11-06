/**
 * Strips formatting:
 * If allowDecimal is true, keeps digits and at most one decimal point.
 * Otherwise, keeps digits only.
 */
export function stripNumberFormatting(val, allowDecimal = false) {
  if (val === '' || val == null) return '';
  const str = String(val);
  if (!allowDecimal) {
    return str.replace(/[^0-9]/g, '');
  }
  let result = '';
  let hasDot = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch >= '0' && ch <= '9') {
      result += ch;
    } else if (ch === '.' && !hasDot) {
      result += ch;
      hasDot = true;
    }
  }
  return result;
}

/**
 * Formats a raw numeric string with commas on blur.
 * E.g. '580000' -> '580,000', '1234.5' -> '1,234.5'
 */
export function formatNumberWithCommas(val, prefix = '', suffix = '') {
  if (val === '' || val == null) return '';
  const clean = String(val).replace(/[^0-9.]/g, '');
  if (clean === '') return '';

  const parts = clean.split('.');
  const intPart = parts[0] ? Number(parts[0]).toLocaleString('en-US') : (parts.length > 1 ? '0' : '');
  const formatted = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  if (!formatted) return '';
  return `${prefix}${formatted}${suffix}`;
}
