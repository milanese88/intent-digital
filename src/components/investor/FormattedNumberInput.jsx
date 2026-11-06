import React, { useState, useEffect, useRef } from 'react';

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

export default function FormattedNumberInput({
  id,
  value,
  onChange,
  onBlur,
  onFocus,
  allowDecimal = false,
  formatOnBlur = true,
  prefix = '',
  suffix = '',
  placeholder = '',
  className = '',
  style = {},
  disabled = false,
  autoComplete = 'off',
  inputMode
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [localRaw, setLocalRaw] = useState(() => stripNumberFormatting(value, allowDecimal));
  const isInternalChangeRef = useRef(false);

  // Sync external value changes when not focused or when changed externally
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    const clean = stripNumberFormatting(value, allowDecimal);
    setLocalRaw(clean);
  }, [value, allowDecimal]);

  const handleFocus = (e) => {
    setIsFocused(true);
    const raw = stripNumberFormatting(value, allowDecimal);
    setLocalRaw(raw);
    if (onFocus) onFocus(e);
  };

  const handleChange = (e) => {
    const rawTyped = e.target.value;
    const clean = stripNumberFormatting(rawTyped, allowDecimal);
    setLocalRaw(clean);
    isInternalChangeRef.current = true;
    if (onChange) {
      onChange(clean);
    }
  };

  const handleBlur = (e) => {
    setIsFocused(false);
    let finalClean = localRaw;
    if (allowDecimal && finalClean.endsWith('.')) {
      finalClean = finalClean.slice(0, -1);
      setLocalRaw(finalClean);
      if (onChange && finalClean !== localRaw) {
        onChange(finalClean);
      }
    }
    if (onBlur) onBlur(e);
  };

  // Determine display value:
  // When focused: show raw string so typing and caret position are natural and never jump
  // When blurred: format with commas (and optional prefix/suffix)
  let displayValue = '';
  if (isFocused) {
    displayValue = localRaw;
  } else {
    const rawToFormat = stripNumberFormatting(value != null && value !== '' ? value : localRaw, allowDecimal);
    if (rawToFormat !== '') {
      displayValue = formatOnBlur
        ? formatNumberWithCommas(rawToFormat, prefix, suffix)
        : `${prefix}${rawToFormat}${suffix}`;
    } else {
      displayValue = '';
    }
  }

  const determinedInputMode = inputMode || (allowDecimal ? 'decimal' : 'numeric');

  return (
    <input
      id={id}
      type="text"
      inputMode={determinedInputMode}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
      autoComplete={autoComplete}
    />
  );
}
