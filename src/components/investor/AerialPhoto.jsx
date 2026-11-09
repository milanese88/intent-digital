import React, { useState } from 'react';
import { getMapboxAerialUrl } from './mapboxAerial.js';

export { getMapboxAerialUrl };

/**
 * AerialPhoto: Renders a property photo, falling back to Mapbox satellite aerial,
 * and finally to the brown placeholder with house icon if image fails to load or no coords.
 */
export default function AerialPhoto({
  lat,
  lng,
  coverPhotoUrl,
  alt = 'Property photo',
  width = 600,
  height = 400,
  style = {},
  className = '',
  aspectRatio = '16/10',
  showAttribution = true,
  children
}) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // If a cover photo exists, prioritize it. Otherwise use Mapbox satellite aerial.
  const aerialUrl = (!coverPhotoUrl && lat != null && lng != null)
    ? getMapboxAerialUrl(lng, lat, width, height, 19)
    : null;

  const targetSrc = coverPhotoUrl || aerialUrl;
  const isMapbox = !coverPhotoUrl && !!aerialUrl;

  const showPlaceholder = !targetSrc || imgError;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: aspectRatio,
        backgroundColor: '#41101B',
        backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(52, 41, 42, 0.45) 0%, rgba(30, 21, 9, 0.85) 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style
      }}
    >
      {!showPlaceholder ? (
        <>
          <img
            src={targetSrc}
            alt={alt}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              transition: 'opacity 0.25s ease',
              opacity: imgLoaded ? 1 : 0.4
            }}
          />

          {/* Mapbox Required Attribution if displaying satellite static image */}
          {isMapbox && showAttribution && (
            <div
              style={{
                position: 'absolute',
                bottom: '6px',
                right: '8px',
                backgroundColor: 'rgba(52, 41, 42, 0.72)',
                backdropFilter: 'blur(4px)',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '9px',
                fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
                color: '#FAF8F5',
                letterSpacing: '0.02em',
                pointerEvents: 'none',
                zIndex: 2
              }}
            >
              © Mapbox © OpenStreetMap
            </div>
          )}
        </>
      ) : (
        /* Fallback brown placeholder with classic house icon */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            color: 'rgba(250, 248, 245, 0.45)'
          }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>
      )}

      {/* Badges / Children overlay (e.g. status badge, flood/zoning pills) */}
      {children}
    </div>
  );
}
