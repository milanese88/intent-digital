import React, { useState } from 'react';

const AnnouncementBanner = () => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="top-announcement-banner">
      <button 
        className="banner-close-btn" 
        onClick={() => setDismissed(true)} 
        aria-label="Dismiss Announcement"
      >
        ✕
      </button>
      <div className="banner-marquee-track">
        <div className="banner-marquee-content">
          <span className="banner-text-item">
            Booking <em>brand &amp; website</em> projects for Summer 2026 onwards!
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            <strong>INTENT DIGITAL STUDIO</strong>
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            Crafting luxury brand identities &amp; high-converting web experiences
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            Booking <em>brand &amp; website</em> projects for Summer 2026 onwards!
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            <strong>INTENT DIGITAL STUDIO</strong>
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            Crafting luxury brand identities &amp; high-converting web experiences
          </span>
          <span className="banner-star">✦</span>
        </div>

        {/* Duplicate Track for Smooth Infinite Loop */}
        <div className="banner-marquee-content" aria-hidden="true">
          <span className="banner-text-item">
            Booking <em>brand &amp; website</em> projects for Summer 2026 onwards!
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            <strong>INTENT DIGITAL STUDIO</strong>
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            Crafting luxury brand identities &amp; high-converting web experiences
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            Booking <em>brand &amp; website</em> projects for Summer 2026 onwards!
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            <strong>INTENT DIGITAL STUDIO</strong>
          </span>
          <span className="banner-star">✦</span>
          <span className="banner-text-item">
            Crafting luxury brand identities &amp; high-converting web experiences
          </span>
          <span className="banner-star">✦</span>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementBanner;
