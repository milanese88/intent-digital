import React from 'react';

/**
 * Editorial Italic Serif Numeral (01, 02, 03...)
 * Matches the site's "Dreams on Paper" / Atelier Fleur package & process numerals.
 */
export default function Numeral({
  number,
  color = 'var(--burgundy)',
  size = 'md',
  className = '',
  style = {}
}) {
  const formatted = typeof number === 'number' 
    ? String(number).padStart(2, '0') 
    : String(number || '01');

  const sizeMap = {
    sm: '28px',
    md: '42px',
    lg: '56px'
  };

  return (
    <span
      className={`ui-numeral ${className}`}
      style={{
        fontFamily: "var(--font-script, 'Dreams on Paper', cursive)",
        fontSize: sizeMap[size] || sizeMap.md,
        color,
        lineHeight: 1,
        display: 'inline-block',
        userSelect: 'none',
        ...style
      }}
    >
      {formatted}
    </span>
  );
}
