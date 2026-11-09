import React from 'react';

/**
 * Handwritten Script Accent component
 * Uses the site's 'Dreams on Paper' cursive script.
 * Used sparingly for stamps, subtle badges, or editorial annotations (e.g. "Featured", "In progress", "Current").
 * NEVER for body text.
 */
export default function ScriptAccent({
  children,
  color = 'var(--burgundy)',
  tilt = true,
  size = 'md',
  className = '',
  style = {}
}) {
  const sizeMap = {
    sm: '16px',
    md: '20px',
    lg: '26px'
  };

  return (
    <span
      className={`ui-script-accent ${className}`}
      style={{
        fontFamily: "var(--font-script, 'Dreams on Paper', cursive)",
        fontSize: sizeMap[size] || sizeMap.md,
        color,
        display: 'inline-block',
        transform: tilt ? 'rotate(-3deg)' : 'none',
        transformOrigin: 'center center',
        lineHeight: 1.1,
        letterSpacing: '0.02em',
        userSelect: 'none',
        ...style
      }}
    >
      {children}
    </span>
  );
}
