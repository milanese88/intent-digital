import React from 'react';
import SectionDivider from './SectionDivider';
import '../styles/meet-the-founder.css';

export default function MeetTheFounder() {
  return (
    <>
      <SectionDivider color="var(--bg-cream)" topColor="var(--neutral-oat)" />
      
      <section className="meet-founder-section">
        <div className="meet-founder-grid">
          {/* Left Column: Image */}
          <div className="meet-founder-img-col">
            <img 
              src="/florencia.jpg" 
              alt="Florencia, founder of Intent Digital" 
              className="meet-founder-img"
            />
          </div>

          {/* Right Column: Content */}
          <div className="meet-founder-info-col">
            <span className="meet-founder-eyebrow">MEET THE FOUNDER</span>
            
            <span className="meet-founder-greeting">Hi, I'm Florencia</span>
            
            <h2 className="meet-founder-headline">
              I was named after the city where{" "}<span className="meet-founder-headline-italic">art was born.</span>
            </h2>
            
            <p className="meet-founder-lede">
              Brand and website designer. Curious for as long as I can remember — and I have come to believe curiosity is where creativity actually starts.
            </p>
          </div>
        </div>
      </section>

      <SectionDivider flip={true} color="var(--neutral-oat)" topColor="var(--bg-cream)" />
    </>
  );
}
