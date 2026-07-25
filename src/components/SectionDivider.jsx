export default function SectionDivider({ color, flip = false }) {
  return (
    <div style={{ lineHeight: 0, transform: flip ? 'rotate(180deg)' : 'none' }}>
      <svg viewBox="0 0 1440 120" preserveAspectRatio="none"
           style={{ display: 'block', width: '100%', height: 'clamp(48px, 7vw, 110px)' }}>
        <path d="M0,64 C240,16 480,8 720,40 C960,72 1200,104 1440,72 L1440,120 L0,120 Z"
              fill={color} />
      </svg>
    </div>
  );
}
