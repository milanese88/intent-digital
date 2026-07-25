import React from 'react';
import SectionDivider from './SectionDivider';
import '../styles/meet-the-founder.css';

export default function MeetTheFounder({ navigateTo }) {
  const handleNavClick = (e, page, targetId) => {
    e.preventDefault();
    if (navigateTo) {
      navigateTo(page, targetId);
    }
  };

  return (
    <>
      <SectionDivider color="var(--bg-cream)" topColor="var(--neutral-oat)" />
      
      <section className="meet-founder-section">
        {/* Intro Block */}
        <div className="meet-founder-grid">
          <div className="meet-founder-img-col">
            <img 
              src="/florencia.jpg" 
              alt="Florencia, founder of Intent Digital" 
              className="meet-founder-img"
            />
          </div>

          <div className="meet-founder-info-col">
            <span className="meet-founder-eyebrow">MEET THE FOUNDER</span>
            <span className="meet-founder-greeting">Hi, I’m Florencia</span>
            <h2 className="meet-founder-headline">
              I was named after the city where{" "}<span className="meet-founder-headline-italic">art was born.</span>
            </h2>
            <p className="meet-founder-lede">
              Brand and website designer. Curious for as long as I can remember — and I have come to believe curiosity is where creativity actually starts.
            </p>
          </div>
        </div>

        {/* Q&A Block */}
        <div className="meet-founder-qa-block">
          {/* Row 1 */}
          <div className="meet-founder-qa-row">
            <div className="meet-founder-qa-question">Florencia?</div>
            <div className="meet-founder-qa-answer">
              <p>
                Florencia in Spanish.{" "}<span className="qa-italic">Florence</span>{" "}in English.{" "}<span className="qa-italic">Firenze</span>{" "}in Italian — the cradle of art.{" "}<span className="qa-bold">I did not choose the name, but I have spent my life trying to earn it.</span>
              </p>
            </div>
          </div>

          {/* Row 2 */}
          <div className="meet-founder-qa-row">
            <div className="meet-founder-qa-question">How I got here</div>
            <div className="meet-founder-qa-answer">
              <p>
                Marketing and IT. Social media, Google Ads, SEO, campaigns, websites built and maintained — technical, measurable, effective work. But every project reached a moment where something had to{" "}<span className="qa-italic">look</span>{" "}and{" "}<span className="qa-italic">feel</span>{" "}like something, and{" "}<span className="qa-bold">that was always the moment I woke up.</span>{" "}Now it is the whole job.
              </p>
            </div>
          </div>

          {/* Row 3 */}
          <div className="meet-founder-qa-row">
            <div className="meet-founder-qa-question">What I believe</div>
            <div className="meet-founder-qa-answer">
              <p>
                <span className="qa-bold">Branding is not a logo and a couple of colours. Branding is the experience.</span>{" "}It is the bridge between you and the people you are meant to reach — or the reason they scroll straight past.
              </p>
              <p>
                Design is a language. It communicates through visuals, and visuals create emotion long before anyone reads a word you have written. By the time someone reaches your copy, your identity has already told them who you are.
              </p>
              <p>
                There is a reason for that, and it is not taste — it is{" "}<span className="qa-italic">neuromarketing.</span>{" "}The brain processes what it sees before it processes what it says. In a fraction of a second it decides whether this is the thing it was looking for.{" "}<span className="qa-bold">If it is, we stop. If it is not, we scroll.</span>
              </p>
              <p>
                <span className="qa-bold">My work is making sure your brand is worth stopping for.</span>
              </p>
            </div>
          </div>

          {/* Row 4 */}
          <div className="meet-founder-qa-row">
            <div className="meet-founder-qa-question">What I can't stand</div>
            <div className="meet-founder-qa-answer">
              <p>
                Brands that look like every other brand. Repetitive. Interchangeable. Honestly?{" "}<span className="qa-bold">Boring.</span>{" "}Your business is none of those things, and your brand should not look like it is.
              </p>
            </div>
          </div>
        </div>

        {/* Closing Block */}
        <div className="meet-founder-closing-block">
          <p className="meet-founder-closing-statement">
            That is the work I am here to do — and I would{" "}<span className="meet-founder-closing-italic">love</span>{" to do it for you."}
          </p>

          <div style={{ marginTop: '32px' }}>
            <a href="#" className="btn btn-cta" onClick={(e) => handleNavClick(e, 'contact')}>
              START YOUR BRAND
            </a>
          </div>

          <div className="meet-founder-signature-wrap">
            <h3 className="meet-founder-signature-name">Florencia</h3>
            <span className="meet-founder-signature-title">FOUNDER, INTENT DIGITAL</span>
          </div>
        </div>
      </section>
    </>
  );
}
