import React, { useState, useEffect, useRef } from 'react';
import { stripNumberFormatting, formatNumberWithCommas } from './numberFormatters.js';

export { stripNumberFormatting, formatNumberWithCommas };

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
