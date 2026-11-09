import React from 'react';

/**
 * Universal Eyebrow label component
 * Uppercase, letter-spaced label (0.22em) used above major section titles and headers.
 * 
 * Variants:
 * - 'on-light': For cream and white backgrounds (var(--muted))
 * - 'on-dark': For espresso hero bands (var(--eyebrow-on-dark))
 */
export default function Eyebrow({
  children,
  onDark = false,
  className = '',
  style = {},
  as: Component = 'span',
  ...rest
}) {
  const baseStyle = {
    display: 'block',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-label)',
    fontWeight: 600,
    letterSpacing: 'var(--letter-spacing-eyebrow)',
    textTransform: 'uppercase',
    color: onDark ? 'var(--eyebrow-on-dark)' : 'var(--muted)',
    lineHeight: 1.2,
    marginBottom: 'var(--space-12)',
    ...style
  };

  return (
    <Component className={`ui-eyebrow ${onDark ? 'ui-eyebrow-on-dark' : ''} ${className}`} style={baseStyle} {...rest}>
      {children}
    </Component>
  );
}
