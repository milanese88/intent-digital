import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function IntroCurtain({ onComplete }) {
  const [isAnimationCompleted, setIsAnimationCompleted] = useState(false);
  const [shouldSkip, setShouldSkip] = useState(false);

  useEffect(() => {
    // Check if intro has already been seen in this session
    const introSeen = sessionStorage.getItem('introSeen');
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (introSeen || prefersReducedMotion) {
      setShouldSkip(true);
      onComplete();
    }
  }, [onComplete]);

  useEffect(() => {
    if (shouldSkip) return;

    // Trigger exit animation after envelope finishes scaling out (~3.2s)
    const timer = setTimeout(() => {
      setIsAnimationCompleted(true);
    }, 3200);

    return () => clearTimeout(timer);
  }, [shouldSkip]);

  const handleCurtainComplete = () => {
    sessionStorage.setItem('introSeen', 'true');
    onComplete();
  };

  const skipIntro = () => {
    setIsAnimationCompleted(true);
    handleCurtainComplete();
  };

  if (shouldSkip) {
    return null;
  }

  return (
    <AnimatePresence onExitComplete={handleCurtainComplete}>
      {!isAnimationCompleted && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          className="curtain-overlay"
        >

          {/* Skip Button */}
          <button onClick={skipIntro} className="intro-skip-btn">
            Skip Intro
          </button>

          {/* Centered Envelope & Letter System */}
          <div className="envelope-container">
            <motion.div
              animate={{ 
                scale: [1, 1, 1.35],
                opacity: [1, 1, 0]
              }}
              transition={{ 
                duration: 0.8, 
                ease: 'easeInOut', 
                delay: 2.6 
              }}
              className="envelope-wrapper"
            >
              {/* Back of Envelope */}
              <div className="envelope-body"></div>

              {/* Letter */}
              <motion.div
                initial={{ y: 0, opacity: 0, scale: 0.95 }}
                animate={{ y: -130, opacity: 1, scale: 1.02 }}
                transition={{ 
                  duration: 0.9, 
                  ease: 'easeOut', 
                  delay: 1.2 
                }}
                className="envelope-letter"
              >
                <img 
                  src="/intent-script-logo.png" 
                  alt="Intent Digital Letterhead" 
                  className="letter-logo" 
                />
                <div className="letter-divider"></div>
                <p className="letter-text">
                  Most businesses don't have a marketing problem,<br />
                  they have an identity problem.
                </p>
                <span className="letter-footer">Fort Lauderdale, FL</span>
              </motion.div>

              {/* Front Pocket of Envelope */}
              <div className="envelope-pocket"></div>

              {/* Flap of Envelope */}
              <motion.div
                initial={{ rotateX: 0 }}
                animate={{ rotateX: -178 }}
                transition={{ 
                  duration: 0.9, 
                  ease: 'easeInOut', 
                  delay: 0.4 
                }}
                className="envelope-flap"
              ></motion.div>

              {/* Terracotta Wax Seal */}
              <motion.div
                initial={{ opacity: 1, scale: 1 }}
                animate={{ opacity: 0, scale: 0.8 }}
                transition={{ 
                  duration: 0.3, 
                  ease: 'easeIn', 
                  delay: 0.4 
                }}
                className="wax-seal"
              >
                iD
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
