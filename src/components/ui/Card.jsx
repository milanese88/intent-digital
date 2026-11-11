import React from 'react';

/**
 * Universal Card component
 * White surface, thin border, 20px border radius, subtle depth.
 * 
 * Props:
 * - featured: When true, applies a 1.5px burgundy border (matching the site's "02" offering card)
 * - hoverable: Subtle lift on hover
 */
export default function Card({
  children,
  hoverable = false,
  featured = false,
  onClick,
  className = '',
  style = {},
  ...rest
}) {
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyle = {
    backgroundColor: 'var(--white, #ffffff)',
    border: featured ? '1.5px solid var(--burgundy)' : '1px solid var(--border)',
    borderRadius: 'var(--radius-card)',
    boxShadow: isHovered && hoverable 
      ? 'var(--shadow-lift)' 
      : featured 
        ? '0 8px 28px rgba(30, 21, 9, 0.08)' 
        : 'var(--shadow-card)',
    transform: isHovered && hoverable ? 'translateY(-2px)' : 'none',
    transition: 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.2s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.2s ease',
    cursor: onClick || hoverable ? 'pointer' : 'default',
    boxSizing: 'border-box',
    overflow: 'hidden',
    position: 'relative',
    ...style
  };

  return (
    <div
      className={`ui-card ${featured ? 'ui-card-featured' : ''} ${hoverable ? 'ui-card-hoverable' : ''} ${className}`}
      style={baseStyle}
      onClick={onClick}
      onMouseEnter={() => hoverable && setIsHovered(true)}
      onMouseLeave={() => hoverable && setIsHovered(false)}
      {...rest}
    >
      {children}
    </div>
  );
}
