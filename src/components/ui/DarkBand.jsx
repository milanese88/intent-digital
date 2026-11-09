import React from 'react';

/**
 * Universal DarkBand component
 * Espresso hero band with optional photo background, espresso overlay,
 * and bottom gradient fade to var(--cream).
 */
export default function DarkBand({
  children,
  photoUrl,
  photoWebpUrl,
  overlayOpacity = 0.55,
  blendToCream = false,
  maxWidth = '1200px',
  paddingTop = '96px',
  paddingBottom = '120px',
  className = '',
  style = {}
}) {
  const hasPhoto = Boolean(photoUrl || photoWebpUrl);

  const backgroundImages = [];
  if (blendToCream) {
    backgroundImages.push('linear-gradient(to bottom, rgba(250, 248, 244, 0) calc(100% - 120px), var(--cream) 100%)');
  }
  if (hasPhoto) {
    backgroundImages.push(`linear-gradient(rgba(27, 19, 13, ${overlayOpacity}), rgba(27, 19, 13, ${overlayOpacity}))`);
    if (photoWebpUrl && photoUrl) {
      backgroundImages.push(`image-set(url('${photoWebpUrl}') type('image/webp'), url('${photoUrl}') type('image/jpeg'))`);
    } else {
      backgroundImages.push(`url('${photoUrl || photoWebpUrl}')`);
    }
  }

  return (
    <section
      className={`ui-dark-band ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
        backgroundColor: 'var(--espresso)',
        backgroundImage: backgroundImages.join(', '),
        backgroundSize: hasPhoto ? 'cover' : 'auto',
        backgroundPosition: hasPhoto ? 'center 40%' : 'center top',
        backgroundRepeat: 'no-repeat',
        color: 'var(--on-dark)',
        paddingTop,
        paddingBottom,
        paddingLeft: 'var(--space-24)',
        paddingRight: 'var(--space-24)',
        ...style
      }}
    >
      <div style={{
        maxWidth,
        margin: '0 auto',
        position: 'relative',
        zIndex: 2,
        boxSizing: 'border-box'
      }}>
        {children}
      </div>
    </section>
  );
}
