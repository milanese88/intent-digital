import React from 'react';

/**
 * Universal SectionHeading component
 * Editorial serif heading with refined typography scale and italic contrast.
 */
export default function SectionHeading({
  children,
  level = 'h2', // 'display' | 'h1' | 'h2' | 'h3'
  onDark = false,
  className = '',
  style = {},
  ...rest
}) {
  const Component = level === 'display' ? 'h1' : level;

  const fontSizes = {
    display: 'var(--text-display)',
    h1: 'var(--text-h1)',
    h2: 'var(--text-h2)',
    h3: 'var(--text-h3)'
  };

  const baseStyle = {
    fontFamily: 'var(--font-display)',
    fontWeight: level === 'h3' ? 400 : 300,
    fontSize: fontSizes[level] || fontSizes.h2,
    lineHeight: 1.15,
    letterSpacing: 'var(--letter-spacing-tight)',
    color: onDark ? 'var(--on-dark)' : 'var(--espresso)',
    margin: 0,
    ...style
  };

  return (
    <Component className={`ui-heading ui-heading-${level} ${onDark ? 'ui-heading-on-dark' : ''} ${className}`} style={baseStyle} {...rest}>
      {children}
    </Component>
  );
}
