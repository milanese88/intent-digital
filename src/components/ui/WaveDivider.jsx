import React from 'react';

/**
 * Soft Wave Divider component
 * Creates the organic editorial curve between cream and beige sections.
 */
export default function WaveDivider({
  color = 'var(--beige)',
  topColor = 'var(--cream)',
  flip = false,
  height = 'clamp(48px, 6vw, 90px)',
  className = '',
  style = {}
}) {
  return (
    <div
      className={`ui-wave-divider ${className}`}
      style={{
        lineHeight: 0,
        backgroundColor: topColor,
        transform: flip ? 'rotate(180deg)' : 'none',
        width: '100%',
        overflow: 'hidden',
        ...style
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        style={{ display: 'block', width: '100%', height }}
      >
        <path
          d="M0,64 C240,16 480,8 720,40 C960,72 1200,104 1440,72 L1440,120 L0,120 Z"
          fill={color}
        />
      </svg>
    </div>
  );
}
