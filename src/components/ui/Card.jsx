import React from 'react';

/**
 * Universal Card component
 * White surface, thin #E4DDD3 border, 20px border radius, subtle depth.
 */
export default function Card({
  children,
  hoverable = false,
  onClick,
  className = '',
  style = {},
  ...rest
}) {
  const [isHovered, setIsHovered] = React.useState(false);

  const baseStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-card)',
    boxShadow: isHovered && hoverable ? 'var(--shadow-lift)' : 'var(--shadow-card)',
    transform: isHovered && hoverable ? 'translateY(-2px)' : 'none',
    transition: 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.2s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.2s ease',
    cursor: onClick || hoverable ? 'pointer' : 'default',
    boxSizing: 'border-box',
    overflow: 'hidden',
    ...style
  };

  return (
    <div
      className={`ui-card ${hoverable ? 'ui-card-hoverable' : ''} ${className}`}
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
