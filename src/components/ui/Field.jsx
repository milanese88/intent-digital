import React from 'react';

/**
 * Universal Field component
 * Renders standard form field with accessible label, input/select/textarea, and validation states.
 */
export default function Field({
  label,
  id,
  type = 'text', // 'text' | 'number' | 'email' | 'url' | 'select' | 'textarea' | 'custom'
  value,
  onChange,
  placeholder,
  required = false,
  error,
  helper,
  children,
  rows = 3,
  className = '',
  style = {},
  inputStyle = {},
  disabled = false,
  ...rest
}) {
  const inputId = id || (label ? `field-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : undefined);

  const controlStyle = {
    width: '100%',
    boxSizing: 'border-box',
    border: error ? '1px solid var(--negative)' : '1px solid var(--border)',
    borderRadius: 'var(--radius-input)',
    padding: '10px 14px',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body-sm)',
    color: 'var(--espresso)',
    backgroundColor: 'var(--cream)',
    minHeight: type === 'textarea' ? 'auto' : '44px',
    transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
    outline: 'none',
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
    ...inputStyle
  };

  const handleFocus = (e) => {
    e.currentTarget.style.backgroundColor = '#ffffff';
    e.currentTarget.style.borderColor = error ? 'var(--negative)' : 'var(--burgundy)';
    e.currentTarget.style.boxShadow = error 
      ? '0 0 0 2px var(--cream), 0 0 0 4px var(--negative)' 
      : 'var(--focus-ring)';
  };

  const handleBlur = (e) => {
    e.currentTarget.style.backgroundColor = 'var(--cream)';
    e.currentTarget.style.borderColor = error ? 'var(--negative)' : 'var(--border)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div className={`ui-field ${className}`} style={{ marginBottom: 'var(--space-20)', ...style }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            display: 'block',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-label)',
            fontWeight: 700,
            letterSpacing: 'var(--letter-spacing-label)',
            textTransform: 'uppercase',
            color: 'var(--espresso)',
            marginBottom: 'var(--space-8)'
          }}
        >
          {label} {required && <span style={{ color: 'var(--negative)' }}>*</span>}
        </label>
      )}

      {type === 'custom' || (children && type !== 'select') ? (
        children
      ) : type === 'textarea' ? (
        <textarea
          id={inputId}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          rows={rows}
          style={controlStyle}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
      ) : type === 'select' ? (
        <select
          id={inputId}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          style={{ ...controlStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        >
          {children}
        </select>
      ) : (
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          style={controlStyle}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
      )}

      {error && (
        <span style={{
          display: 'block',
          marginTop: '6px',
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          color: 'var(--negative)'
        }}>
          {error}
        </span>
      )}

      {!error && helper && (
        <span style={{
          display: 'block',
          marginTop: '6px',
          fontFamily: 'var(--font-sans)',
          fontSize: '11px',
          color: 'var(--muted)'
        }}>
          {helper}
        </span>
      )}
    </div>
  );
}
