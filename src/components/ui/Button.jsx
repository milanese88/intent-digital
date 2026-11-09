import React from 'react';

/**
 * Universal Button component for Intent Digital
 * Accessible, 44px touch targets, full token styling.
 * 
 * Variants:
 * - 'primary': Burgundy pill (main actions)
 * - 'secondary': Outline pill on light surfaces
 * - 'accent': Terracotta pill (Designer Hub actions)
 * - 'outline-on-dark': Outline pill on dark espresso hero bands
 * - 'text': Uppercase letter-spaced link
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  type = 'button',
  href,
  className = '',
  style = {},
  title,
  ariaLabel,
  ...rest
}) {
  const isText = variant === 'text';

  const baseStyle = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: isText ? 'var(--letter-spacing-label)' : 'var(--letter-spacing-pill)',
    fontSize: size === 'sm' ? 'var(--text-label)' : size === 'lg' ? '13px' : '11px',
    borderRadius: isText ? '4px' : 'var(--radius-pill)',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    textDecoration: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)',
    minHeight: isText ? 'auto' : '44px',
    padding: isText 
      ? '6px 0' 
      : size === 'sm' 
        ? '8px 16px' 
        : size === 'lg' 
          ? '14px 28px' 
          : '10px 22px',
    opacity: disabled ? 0.5 : 1,
    outline: 'none',
    ...style
  };

  let variantStyle = {};
  if (variant === 'primary') {
    variantStyle = {
      backgroundColor: 'var(--burgundy)',
      color: 'var(--cream)',
      boxShadow: disabled ? 'none' : '0 4px 14px rgba(58, 20, 24, 0.25)',
      border: '1px solid var(--burgundy)'
    };
  } else if (variant === 'secondary') {
    variantStyle = {
      backgroundColor: '#ffffff',
      border: '1px solid var(--border-strong)',
      color: 'var(--espresso)',
      boxShadow: '0 2px 8px rgba(27, 19, 13, 0.03)'
    };
  } else if (variant === 'accent') {
    variantStyle = {
      backgroundColor: 'var(--terracotta)',
      border: '1px solid var(--terracotta)',
      color: '#ffffff',
      boxShadow: disabled ? 'none' : '0 4px 16px rgba(192, 90, 42, 0.35)'
    };
  } else if (variant === 'outline-on-dark') {
    variantStyle = {
      backgroundColor: 'transparent',
      border: '1px solid rgba(233, 223, 210, 0.35)',
      color: 'var(--eyebrow-on-dark)'
    };
  } else if (variant === 'text') {
    variantStyle = {
      backgroundColor: 'transparent',
      color: 'var(--espresso)',
      padding: '4px 0'
    };
  }

  const handleMouseEnter = (e) => {
    if (disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.backgroundColor = '#290D11';
      e.currentTarget.style.borderColor = '#290D11';
      e.currentTarget.style.transform = 'translateY(-1px)';
    } else if (variant === 'secondary') {
      e.currentTarget.style.borderColor = 'var(--burgundy)';
      e.currentTarget.style.color = 'var(--burgundy)';
      e.currentTarget.style.transform = 'translateY(-1px)';
    } else if (variant === 'accent') {
      e.currentTarget.style.backgroundColor = '#A84B1F';
      e.currentTarget.style.borderColor = '#A84B1F';
      e.currentTarget.style.transform = 'translateY(-1px)';
    } else if (variant === 'outline-on-dark') {
      e.currentTarget.style.borderColor = 'var(--eyebrow-on-dark)';
      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
    } else if (variant === 'text') {
      e.currentTarget.style.color = 'var(--burgundy)';
    }
  };

  const handleMouseLeave = (e) => {
    if (disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.backgroundColor = 'var(--burgundy)';
      e.currentTarget.style.borderColor = 'var(--burgundy)';
      e.currentTarget.style.transform = 'none';
    } else if (variant === 'secondary') {
      e.currentTarget.style.borderColor = 'var(--border-strong)';
      e.currentTarget.style.color = 'var(--espresso)';
      e.currentTarget.style.transform = 'none';
    } else if (variant === 'accent') {
      e.currentTarget.style.backgroundColor = 'var(--terracotta)';
      e.currentTarget.style.borderColor = 'var(--terracotta)';
      e.currentTarget.style.transform = 'none';
    } else if (variant === 'outline-on-dark') {
      e.currentTarget.style.borderColor = 'rgba(233, 223, 210, 0.35)';
      e.currentTarget.style.backgroundColor = 'transparent';
    } else if (variant === 'text') {
      e.currentTarget.style.color = 'var(--espresso)';
    }
  };

  const handleFocus = (e) => {
    e.currentTarget.style.boxShadow = variant === 'accent' ? 'var(--focus-ring-terracotta)' : 'var(--focus-ring)';
  };

  const handleBlur = (e) => {
    e.currentTarget.style.boxShadow = variantStyle.boxShadow || 'none';
  };

  const mergedStyle = { ...baseStyle, ...variantStyle };

  if (href && !disabled) {
    return (
      <a
        href={href}
        className={`ui-btn ui-btn-${variant} ${className}`}
        style={mergedStyle}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        title={title}
        aria-label={ariaLabel}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={`ui-btn ui-btn-${variant} ${className}`}
      style={mergedStyle}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      title={title}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
