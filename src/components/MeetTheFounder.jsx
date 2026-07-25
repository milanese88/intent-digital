import React from 'react';
import SectionDivider from './SectionDivider';
import '../styles/meet-the-founder.css';

export default function MeetTheFounder() {
  return (
    <>
      <SectionDivider color="var(--bg-cream)" topColor="var(--neutral-oat)" />
      
      <section className="meet-founder-section">
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)' }}>PLACEHOLDER</h2>
        </div>
      </section>

      <SectionDivider flip={true} color="var(--neutral-oat)" topColor="var(--bg-cream)" />
    </>
  );
}
