import React, { useState, useEffect } from 'react';
import {
  Button,
  Card,
  Numeral,
  Eyebrow,
  Pill,
  ScriptAccent
} from '../ui/index.js';

function formatCurrency(val) {
  if (val == null || isNaN(val)) return '—';
  return `$${Math.round(Number(val)).toLocaleString()}`;
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export default function LearningLabTab({ setActiveDashboardTab }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [dealOffset, setDealOffset] = useState(0);
  const [guessOffset, setGuessOffset] = useState(0);
  const [termIndex, setTermIndex] = useState(0);
  const [principleIndex, setPrincipleIndex] = useState(0);

  // Interaction states
  const [dealAnswer, setDealAnswer] = useState(null);
  const [isSubmittingDeal, setIsSubmittingDeal] = useState(false);

  const [selectedGuessOption, setSelectedGuessOption] = useState(null);
  const [guessAnswered, setGuessAnswered] = useState(false);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);

  const [toastMessage, setToastMessage] = useState(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const showToast = (msg) => setToastMessage(msg);

  // Fetch Lab Data
  const loadLabData = async (dOffset = dealOffset, gOffset = guessOffset) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/journal/learning-lab?deal_offset=${dOffset}&guess_offset=${gOffset}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);

        // Pre-fill if already answered
        if (json.dealOfTheDay?.isAnswered) {
          setDealAnswer(json.dealOfTheDay.userAnswer);
        } else {
          setDealAnswer(null);
        }

        if (json.guessProperty?.isAnswered) {
          setGuessAnswered(true);
          setSelectedGuessOption(json.guessProperty.userAnswer);
        } else {
          setGuessAnswered(false);
          setSelectedGuessOption(null);
        }

        // Set initial term/principle index by day of year
        const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        if (json.terms?.length > 0) {
          setTermIndex(dayOfYear % json.terms.length);
        }
        if (json.principles?.length > 0) {
          setPrincipleIndex(dayOfYear % json.principles.length);
        }
      }
    } catch (err) {
      console.error('Failed to load learning lab data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLabData(0, 0);
  }, []);

  // Handle Deal Answer
  const handleAnswerDeal = async (answer) => {
    if (!data?.dealOfTheDay || isSubmittingDeal) return;
    setDealAnswer(answer);
    try {
      setIsSubmittingDeal(true);
      const isCorrectFlipperMove = (data.dealOfTheDay.spread <= 0 && answer === 'YES') ||
                                   (data.dealOfTheDay.spread > 0 && answer === 'NO');

      await fetch('/api/journal/learning-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: 'deal',
          item_key: data.dealOfTheDay.saleId,
          answer,
          correct: isCorrectFlipperMove
        })
      });

      // Update local streak and count
      setData(prev => ({
        ...prev,
        progress: {
          ...prev.progress,
          dealsReviewedCount: (prev.progress.dealsReviewedCount || 0) + 1,
          monthlyStats: {
            ...prev.progress.monthlyStats,
            dealsThisMonth: (prev.progress.monthlyStats.dealsThisMonth || 0) + 1
          }
        }
      }));
      showToast('Deal answer recorded in your progress');
    } catch (err) {
      console.error('Failed to record deal answer:', err);
    } finally {
      setIsSubmittingDeal(false);
    }
  };

  // Another Deal
  const handleAnotherDeal = () => {
    const nextOffset = dealOffset + 1;
    setDealOffset(nextOffset);
    loadLabData(nextOffset, guessOffset);
  };

  // Handle Guess Value Submit
  const handleSelectGuess = async (option) => {
    if (guessAnswered || isSubmittingGuess || !data?.guessProperty) return;
    setSelectedGuessOption(option.id);
    setGuessAnswered(true);

    try {
      setIsSubmittingGuess(true);
      await fetch('/api/journal/learning-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: 'guess',
          item_key: data.guessProperty.itemKey,
          answer: option.id,
          correct: option.isCorrect
        })
      });
      showToast(option.isCorrect ? 'Spot on! Correct valuation.' : 'Valuation recorded.');
    } catch (err) {
      console.error('Failed to record guess:', err);
    } finally {
      setIsSubmittingGuess(false);
    }
  };

  // Another Guess
  const handleAnotherGuess = () => {
    const nextOffset = guessOffset + 1;
    setGuessOffset(nextOffset);
    loadLabData(dealOffset, nextOffset);
  };

  // Toggle Term Learned
  const handleToggleTermLearned = async (term) => {
    if (!term) return;
    const isLearned = data?.progress?.learnedKeys?.includes(term.id);
    const nextLearned = !isLearned;

    // Optimistic update
    setData(prev => {
      const keys = new Set(prev.progress.learnedKeys || []);
      if (nextLearned) keys.add(term.id);
      else keys.delete(term.id);
      return {
        ...prev,
        progress: {
          ...prev.progress,
          termsLearnedCount: nextLearned ? prev.progress.termsLearnedCount + 1 : Math.max(0, prev.progress.termsLearnedCount - 1),
          learnedKeys: Array.from(keys)
        }
      };
    });

    try {
      await fetch('/api/journal/learning-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: 'term',
          item_key: term.id,
          answer: nextLearned ? 'learned' : 'unlearned',
          correct: true
        })
      });
      showToast(nextLearned ? `Marked "${term.title}" as learned ✓` : `Unmarked "${term.title}"`);
    } catch (err) {
      console.error('Failed to record term progress:', err);
    }
  };

  // Toggle Principle Learned
  const handleTogglePrincipleLearned = async (principle) => {
    if (!principle) return;
    const isLearned = data?.progress?.learnedKeys?.includes(principle.id);
    const nextLearned = !isLearned;

    // Optimistic update
    setData(prev => {
      const keys = new Set(prev.progress.learnedKeys || []);
      if (nextLearned) keys.add(principle.id);
      else keys.delete(principle.id);
      return {
        ...prev,
        progress: {
          ...prev.progress,
          principlesLearnedCount: nextLearned ? prev.progress.principlesLearnedCount + 1 : Math.max(0, prev.progress.principlesLearnedCount - 1),
          learnedKeys: Array.from(keys)
        }
      };
    });

    try {
      await fetch('/api/journal/learning-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity: 'principle',
          item_key: principle.id,
          answer: nextLearned ? 'learned' : 'unlearned',
          correct: true
        })
      });
      showToast(nextLearned ? `Marked "${principle.title}" as learned ✓` : `Unmarked "${principle.title}"`);
    } catch (err) {
      console.error('Failed to record principle progress:', err);
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', backgroundColor: 'var(--cream, #FAF8F5)', minHeight: '100vh' }}>
        <span style={{ fontFamily: 'var(--font-script)', fontSize: '26px', color: 'var(--burgundy)' }}>
          Opening The Learning Lab...
        </span>
      </div>
    );
  }

  const progress = data?.progress || {};
  const dayStreak = progress.dayStreak || 0;
  const termsLearnedCount = progress.termsLearnedCount || 0;
  const dealsReviewedCount = progress.dealsReviewedCount || 0;
  const monthlyStats = progress.monthlyStats || {};
  const learnedKeys = progress.learnedKeys || [];

  const deal = data?.dealOfTheDay;
  const guess = data?.guessProperty;
  const currentTerm = data?.terms?.[termIndex] || data?.terms?.[0];
  const currentPrinciple = data?.principles?.[principleIndex] || data?.principles?.[0];
  const liveTieIn = currentTerm ? data?.liveTieIns?.[currentTerm.id] : null;

  // Render Principle Visual
  const renderPrincipleVisual = (principle) => {
    if (!principle) return null;
    const vType = principle.visualType || 'bar_60_30_10';

    if (vType === 'bar_60_30_10') {
      return (
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            display: 'flex',
            height: '16px',
            borderRadius: '50px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            marginBottom: '8px'
          }}>
            <div style={{ width: '60%', backgroundColor: '#FAF8F5', height: '100%', borderRight: '1px solid var(--border)' }} title="60% Base (Cream)" />
            <div style={{ width: '30%', backgroundColor: '#34292A', height: '100%' }} title="30% Depth (Espresso)" />
            <div style={{ width: '10%', backgroundColor: '#BDD3E2', height: '100%' }} title="10% Accent (Quietude)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>
            <span>60% Base (Cream)</span>
            <span>30% Depth (Espresso)</span>
            <span>10% Accent</span>
          </div>
        </div>
      );
    }

    if (vType === 'lighting_tiers') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '60px', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, color: 'var(--muted)' }}>AMBIENT</span>
            <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #F7F3EE, #F2EFEA)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '60px', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, color: 'var(--burgundy)' }}>TASK</span>
            <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #8E5736, #41101B)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '60px', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, color: 'var(--muted)' }}>ACCENT</span>
            <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #BDD3E2, #859DCE)' }} />
          </div>
        </div>
      );
    }

    if (vType === 'texture_swatches') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#DDD2C4', border: '1px solid rgba(0,0,0,0.1)' }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>Slub Linen</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#EAE6E1', border: '1px solid rgba(0,0,0,0.1)' }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>Honed Travertine</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#745244', border: '1px solid rgba(0,0,0,0.1)' }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--muted)' }}>Burnished Brass</span>
          </div>
        </div>
      );
    }

    // Default geometric triad/scale
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', height: '40px', backgroundColor: 'var(--sand, #F7F3EE)', borderRadius: '8px', marginBottom: '20px' }}>
        <span style={{ width: '24px', height: '24px', borderRadius: '4px', backgroundColor: '#34292A' }} />
        <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#41101B' }} />
        <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#BDD3E2' }} />
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: 'var(--cream, #FAF8F5)', minHeight: '100vh', paddingBottom: '96px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--espresso, #1E1509)',
          color: '#FAF8F5',
          fontFamily: 'var(--font-sans)',
          fontSize: '12.5px',
          padding: '12px 20px',
          borderRadius: '50px',
          boxShadow: '0 8px 24px rgba(30, 21, 9, 0.25)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <span style={{ color: 'var(--burgundy, #BDD3E2)' }}>✦</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =====================================================================
          1. DARK ESPRESSO HEADER BAND
          ===================================================================== */}
      <section style={{
        backgroundColor: 'var(--espresso, #1E1509)',
        color: 'var(--on-dark, #FAF8F5)',
        padding: '48px 5% 56px 5%',
        borderBottom: '1px solid rgba(250, 248, 245, 0.1)',
        boxShadow: '0 10px 30px rgba(30, 21, 9, 0.15)'
      }}>
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          {/* Eyebrow */}
          <div style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--eyebrow-on-dark, #E6DFD7)',
            marginBottom: '14px'
          }}>
            THE LEARNING LAB · {formatDate().toUpperCase()}
          </div>

          {/* Two-Line Headline: Regular H1 + Italic Same Color */}
          <div style={{ marginBottom: '36px' }}>
            <h1 style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: 'clamp(38px, 5vw, 60px)',
              fontWeight: 400,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'var(--on-dark, #FAF8F5)',
              margin: '0 0 6px 0'
            }}>
              Sharpen your eye.
            </h1>
            <p style={{
              fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
              fontSize: 'clamp(32px, 4.2vw, 50px)',
              fontStyle: 'italic',
              fontWeight: 400,
              lineHeight: 1.15,
              color: 'var(--on-dark, #FAF8F5)',
              margin: 0,
              letterSpacing: '-0.015em'
            }}>
              Know the numbers.
            </p>
          </div>

          {/* Three Outline Stat Tiles */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            {/* Tile 1: Day Streak */}
            <div style={{
              border: '1px solid rgba(250, 248, 245, 0.2)',
              borderRadius: '14px',
              padding: '20px 24px',
              backgroundColor: 'rgba(250, 248, 245, 0.04)'
            }}>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--eyebrow-on-dark, #E6DFD7)',
                marginBottom: '8px'
              }}>
                DAY STREAK
              </span>
              <div style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '32px',
                color: '#FAF8F5',
                display: 'flex',
                alignItems: 'baseline',
                gap: '8px'
              }}>
                <span>{dayStreak}</span>
                <span style={{ fontSize: '16px', fontFamily: 'var(--font-sans)', color: 'var(--on-dark-muted)' }}>
                  {dayStreak === 1 ? 'day' : 'days'}
                </span>
                {dayStreak > 0 && <span style={{ color: 'var(--burgundy, #BDD3E2)', fontSize: '18px' }}>✦</span>}
              </div>
            </div>

            {/* Tile 2: Terms Learned */}
            <div style={{
              border: '1px solid rgba(250, 248, 245, 0.2)',
              borderRadius: '14px',
              padding: '20px 24px',
              backgroundColor: 'rgba(250, 248, 245, 0.04)'
            }}>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--eyebrow-on-dark, #E6DFD7)',
                marginBottom: '8px'
              }}>
                TERMS LEARNED
              </span>
              <div style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '32px',
                color: '#FAF8F5'
              }}>
                {termsLearnedCount} <span style={{ fontSize: '18px', color: 'var(--on-dark-muted)' }}>/ 40</span>
              </div>
            </div>

            {/* Tile 3: Deals Reviewed */}
            <div style={{
              border: '1px solid rgba(250, 248, 245, 0.2)',
              borderRadius: '14px',
              padding: '20px 24px',
              backgroundColor: 'rgba(250, 248, 245, 0.04)'
            }}>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--eyebrow-on-dark, #E6DFD7)',
                marginBottom: '8px'
              }}>
                DEALS REVIEWED
              </span>
              <div style={{
                fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                fontSize: '32px',
                color: '#FAF8F5'
              }}>
                {dealsReviewedCount}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <main style={{ maxWidth: '1160px', margin: '0 auto', padding: '48px 5% 0 5%', boxSizing: 'border-box' }}>
        {/* =====================================================================
            2. DEAL OF THE DAY (Featured White Card with Burgundy Border)
            ===================================================================== */}
        <section style={{ marginBottom: '56px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
              <Numeral number="01" size="md" color="var(--burgundy)" />
              <Eyebrow style={{ margin: 0 }}>DEAL OF THE DAY · REAL MARKET SALE</Eyebrow>
            </div>

            <button
              type="button"
              onClick={handleAnotherDeal}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--burgundy, #41101B)',
                cursor: 'pointer'
              }}
            >
              Another deal →
            </button>
          </div>

          {deal ? (
            <Card
              featured={true}
              style={{
                padding: '36px',
                position: 'relative',
                boxShadow: '0 12px 36px rgba(30, 21, 9, 0.08)'
              }}
            >
              {/* Script Stamp in Top-Right */}
              <div style={{ position: 'absolute', top: '24px', right: '32px' }}>
                <ScriptAccent size="lg" color="var(--burgundy)">
                  Deal of the day
                </ScriptAccent>
              </div>

              {/* Property Header */}
              <div style={{ maxWidth: '75%', marginBottom: '24px' }}>
                <h2 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: 'clamp(28px, 3.6vw, 42px)',
                  fontWeight: 400,
                  lineHeight: 1.15,
                  color: 'var(--espresso, #1E1509)',
                  margin: '0 0 6px 0',
                  letterSpacing: '-0.02em'
                }}>
                  {deal.address}
                </h2>
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--text-2, #4A413A)',
                  margin: 0
                }}>
                  {deal.city}, FL {deal.zip} · {deal.sqft.toLocaleString()} living sqft · Built {deal.yearBuilt}
                </p>
              </div>

              {/* Sale Price & Market Metrics */}
              <div style={{
                backgroundColor: 'var(--sand, #F7F3EE)',
                borderRadius: '14px',
                padding: '24px',
                border: '1px solid var(--border)',
                marginBottom: '28px'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '20px',
                  marginBottom: '20px'
                }}>
                  <div>
                    <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      ACTUAL SALE PRICE
                    </span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--espresso)' }}>
                      {formatCurrency(deal.soldPrice)}
                    </div>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)' }}>
                      ${deal.pps}/sf · Sold {deal.soldMonth}/{deal.soldYear}
                    </span>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      ZIP MEDIAN ($/SF)
                    </span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--espresso)' }}>
                      ${deal.zipMedianPps}/sf
                    </div>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)' }}>
                      In ZIP {deal.zip}
                    </span>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      ESTIMATED ARV
                    </span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--espresso)' }}>
                      {formatCurrency(deal.arv)}
                    </div>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)' }}>
                      ${deal.renoMedianPps}/sf based on {deal.renoCompsCount} reno comps
                    </span>
                  </div>

                  <div>
                    <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '4px' }}>
                      REHAB (ASSUMPTION)
                    </span>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--espresso)' }}>
                      {formatCurrency(deal.rehabTotal)}
                    </div>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)' }}>
                      ${deal.rehabRate}/sf ({deal.yearBuilt < 1980 ? 'pre-1980' : 'post-1980'})
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13.5px', color: 'var(--text-2)', margin: 0 }}>
                    <strong>70% Rule Max Offer:</strong> {formatCurrency(deal.arv)} × 70% − {formatCurrency(deal.rehabTotal)} = <strong>{formatCurrency(deal.maxOffer)}</strong>.
                  </p>
                </div>
              </div>

              {/* Question & Interactive Answer */}
              <div style={{
                backgroundColor: 'var(--beige, #F2EFEA)',
                borderRadius: '14px',
                padding: '24px 28px',
                border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: dealAnswer ? '20px' : 0 }}>
                  <span style={{
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '20px',
                    color: 'var(--espresso)'
                  }}>
                    {deal.question}
                  </span>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      disabled={isSubmittingDeal}
                      onClick={() => handleAnswerDeal('YES')}
                      style={{
                        padding: '10px 24px',
                        borderRadius: '50px',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: '1.5px solid var(--burgundy)',
                        backgroundColor: dealAnswer === 'YES' ? 'var(--burgundy)' : 'transparent',
                        color: dealAnswer === 'YES' ? '#FAF8F5' : 'var(--burgundy)'
                      }}
                    >
                      YES
                    </button>

                    <button
                      type="button"
                      disabled={isSubmittingDeal}
                      onClick={() => handleAnswerDeal('NO')}
                      style={{
                        padding: '10px 24px',
                        borderRadius: '50px',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: '1.5px solid var(--espresso)',
                        backgroundColor: dealAnswer === 'NO' ? 'var(--espresso)' : 'transparent',
                        color: dealAnswer === 'NO' ? '#FAF8F5' : 'var(--espresso)'
                      }}
                    >
                      NO
                    </button>
                  </div>
                </div>

                {/* Post-Answer Reveal */}
                {dealAnswer && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    paddingTop: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Pill variant={deal.spread <= 0 ? 'positive' : 'warning'}>
                        {deal.spread <= 0 ? 'DISCIPLINED FLIPPER PRICE' : 'ABOVE FLIPPER CEILING'}
                      </Pill>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--espresso)' }}>
                        70% Max Offer: {formatCurrency(deal.maxOffer)} vs Sale: {formatCurrency(deal.soldPrice)}
                      </span>
                    </div>

                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14.5px', lineHeight: 1.6, color: 'var(--text-2)', margin: 0 }}>
                      {deal.diagnosis}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
                No recent market sales found with 5+ renovated comps in your watched ZIPs.
              </p>
            </Card>
          )}
        </section>

        {/* =====================================================================
            3. TWO-COLUMN GRID: TERM OF THE DAY & DESIGN PRINCIPLE OF THE DAY
            ===================================================================== */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '32px',
          marginBottom: '56px'
        }}>
          {/* -----------------------------------------------------------------
              TERM OF THE DAY
              ----------------------------------------------------------------- */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                <Numeral number="02" size="md" color="var(--burgundy)" />
                <Eyebrow style={{ margin: 0 }}>TERM OF THE DAY</Eyebrow>
              </div>

              <button
                type="button"
                onClick={() => setTermIndex(prev => (prev + 1) % (data?.terms?.length || 40))}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--burgundy, #41101B)',
                  cursor: 'pointer'
                }}
              >
                Next term →
              </button>
            </div>

            {currentTerm && (
              <Card style={{ padding: '32px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 50px)', boxSizing: 'border-box' }}>
                {/* Header: Term Title + Full Name */}
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '32px',
                    fontWeight: 400,
                    lineHeight: 1.1,
                    color: 'var(--espresso)',
                    margin: '0 0 4px 0',
                    letterSpacing: '-0.02em'
                  }}>
                    {currentTerm.title}
                  </h3>
                  <span style={{
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '17px',
                    fontStyle: 'italic',
                    color: 'var(--muted)'
                  }}>
                    {currentTerm.fullName}
                  </span>
                </div>

                {/* Definition */}
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14.5px',
                  lineHeight: 1.65,
                  color: 'var(--espresso)',
                  margin: '0 0 20px 0'
                }}>
                  {currentTerm.definition}
                </p>

                {/* Example Box */}
                <div style={{
                  backgroundColor: 'var(--sand, #F7F3EE)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '20px'
                }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '6px' }}>
                    REAL EXAMPLE
                  </span>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13.5px', lineHeight: 1.55, color: 'var(--text-2)', margin: 0 }}>
                    {currentTerm.example}
                  </p>
                </div>

                {/* Live Tie-in or App Pointer */}
                <div style={{ marginBottom: '24px', flex: 1 }}>
                  {liveTieIn ? (
                    <div style={{
                      backgroundColor: 'rgba(65, 16, 27, 0.06)',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      border: '1px solid rgba(65, 16, 27, 0.15)'
                    }}>
                      <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--burgundy)', marginBottom: '4px' }}>
                        ✦ YOUR DATA IN ACTION
                      </span>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--espresso)' }}>
                        {liveTieIn}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--muted)' }}>
                      <strong>Where you'll see it:</strong> {currentTerm.appPointer}
                    </div>
                  )}
                </div>

                {/* Action: Mark as Learned */}
                <div style={{ marginTop: 'auto' }}>
                  <Button
                    variant={learnedKeys.includes(currentTerm.id) ? 'secondary' : 'primary'}
                    onClick={() => handleToggleTermLearned(currentTerm)}
                  >
                    {learnedKeys.includes(currentTerm.id) ? 'LEARNED ✓' : 'MARK AS LEARNED →'}
                  </Button>
                </div>
              </Card>
            )}
          </section>

          {/* -----------------------------------------------------------------
              DESIGN PRINCIPLE OF THE DAY
              ----------------------------------------------------------------- */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                <Numeral number="03" size="md" color="var(--burgundy)" />
                <Eyebrow style={{ margin: 0 }}>DESIGN PRINCIPLE OF THE DAY</Eyebrow>
              </div>

              <button
                type="button"
                onClick={() => setPrincipleIndex(prev => (prev + 1) % (data?.principles?.length || 40))}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--burgundy, #41101B)',
                  cursor: 'pointer'
                }}
              >
                Next principle →
              </button>
            </div>

            {currentPrinciple && (
              <Card style={{ padding: '32px', display: 'flex', flexDirection: 'column', height: 'calc(100% - 50px)', boxSizing: 'border-box' }}>
                {/* Title */}
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{
                    fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                    fontSize: '28px',
                    fontWeight: 400,
                    lineHeight: 1.15,
                    color: 'var(--espresso)',
                    margin: 0,
                    letterSpacing: '-0.02em'
                  }}>
                    {currentPrinciple.title}
                  </h3>
                </div>

                {/* Definition */}
                <p style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14.5px',
                  lineHeight: 1.65,
                  color: 'var(--espresso)',
                  margin: '0 0 20px 0'
                }}>
                  {currentPrinciple.definition}
                </p>

                {/* Visual Component */}
                {renderPrincipleVisual(currentPrinciple)}

                {/* Example Move */}
                <div style={{
                  backgroundColor: 'var(--sand, #F7F3EE)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '24px',
                  flex: 1
                }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--burgundy)', marginBottom: '6px' }}>
                    DIRECTORIAL MOVE
                  </span>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13.5px', lineHeight: 1.55, color: 'var(--text-2)', margin: 0 }}>
                    {currentPrinciple.example}
                  </p>
                </div>

                {/* Action Buttons: Apply to Room & Mark as Learned */}
                <div style={{ marginTop: 'auto', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Button
                    variant="primary"
                    onClick={() => setActiveDashboardTab && setActiveDashboardTab('designer')}
                  >
                    APPLY TO A ROOM →
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => handleTogglePrincipleLearned(currentPrinciple)}
                  >
                    {learnedKeys.includes(currentPrinciple.id) ? 'LEARNED ✓' : 'MARK LEARNED'}
                  </Button>
                </div>
              </Card>
            )}
          </section>
        </div>

        {/* =====================================================================
            4. PRACTICE · GUESS THE VALUE (Beige Card)
            ===================================================================== */}
        <section style={{ marginBottom: '56px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
              <Numeral number="04" size="md" color="var(--burgundy)" />
              <Eyebrow style={{ margin: 0 }}>PRACTICE · GUESS THE VALUE</Eyebrow>
            </div>

            <button
              type="button"
              onClick={handleAnotherGuess}
              style={{
                background: 'none',
                border: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--burgundy, #41101B)',
                cursor: 'pointer'
              }}
            >
              Try another property →
            </button>
          </div>

          {guess ? (
            <div style={{
              backgroundColor: 'var(--beige, #F2EFEA)',
              borderRadius: 'var(--radius-card)',
              padding: '36px 40px',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-card)'
            }}>
              <div style={{ maxWidth: '600px', marginBottom: '24px' }}>
                <h3 style={{
                  fontFamily: 'var(--font-display, "Atelier Fleur", Georgia, serif)',
                  fontSize: 'clamp(24px, 3vw, 34px)',
                  fontWeight: 400,
                  color: 'var(--espresso)',
                  margin: '0 0 6px 0',
                  letterSpacing: '-0.02em'
                }}>
                  {guess.address}
                </h3>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: 'var(--text-2)', margin: 0 }}>
                  {guess.city}, FL {guess.zip} · {guess.sqft.toLocaleString()} sqft · Built {guess.yearBuilt} · {guess.lotSqft.toLocaleString()} sqft lot
                </p>
              </div>

              {/* 3 Radio Options */}
              <div style={{ marginBottom: '24px' }}>
                <span style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  marginBottom: '12px'
                }}>
                  WHAT IS THIS PROPERTY WORTH BASED ON RECENT NEIGHBORHOOD COMPS?
                </span>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px'
                }}>
                  {guess.options.map(opt => {
                    const isSelected = selectedGuessOption === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={guessAnswered || isSubmittingGuess}
                        onClick={() => handleSelectGuess(opt)}
                        style={{
                          backgroundColor: isSelected
                            ? (opt.isCorrect ? 'var(--positive, #3F5A3A)' : 'var(--negative, #8A2A1E)')
                            : (guessAnswered && opt.isCorrect ? 'rgba(63, 90, 58, 0.15)' : '#FFFFFF'),
                          color: isSelected
                            ? '#FAF8F5'
                            : (guessAnswered && opt.isCorrect ? 'var(--positive)' : 'var(--espresso)'),
                          border: isSelected
                            ? 'none'
                            : (guessAnswered && opt.isCorrect ? '1.5px solid var(--positive)' : '1px solid var(--border)'),
                          borderRadius: '12px',
                          padding: '18px 20px',
                          textAlign: 'center',
                          cursor: guessAnswered ? 'default' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', marginBottom: '2px' }}>
                          {formatCurrency(opt.value)}
                        </div>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', opacity: 0.8 }}>
                          ${Math.round(opt.value / guess.sqft)}/sf
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reveal info */}
              {guessAnswered && (
                <div style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  padding: '20px 24px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px'
                }}>
                  <div>
                    <span style={{
                      display: 'block',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--positive, #3F5A3A)',
                      marginBottom: '4px'
                    }}>
                      ACTUAL COMP VALUATION: {formatCurrency(guess.compValue)}
                    </span>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: '13.5px', color: 'var(--text-2)', margin: 0 }}>
                      Based on {guess.compsCount} nearby single-family comps with a median of ${guess.medianCompPps}/sf.
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActiveDashboardTab && setActiveDashboardTab('investor')}
                  >
                    VIEW COMPS IN INVESTOR STUDIO →
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Card style={{ padding: '36px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-sans)', color: 'var(--muted)' }}>
                No practice properties currently loaded.
              </p>
            </Card>
          )}
        </section>

        {/* =====================================================================
            5. FOOTER SUMMARY LINE
            ===================================================================== */}
        <section style={{
          backgroundColor: 'var(--sand, #F7F3EE)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          padding: '20px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px'
        }}>
          {/* Monthly progress */}
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--espresso)' }}>
            <strong>This month:</strong> {monthlyStats.termsThisMonth || 0} terms learned · {monthlyStats.dealsThisMonth || 0} deals reviewed · {monthlyStats.principlesThisMonth || 0} principles applied
          </div>

          {/* Next Consultation Call */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-sans)', fontSize: '12.5px', color: 'var(--muted)' }}>
            <span style={{ color: 'var(--burgundy)' }}>✦</span>
            <span>
              {data?.nextBooking ? (
                `Next call: ${new Date(data.nextBooking.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} with ${data.nextBooking.attendee}`
              ) : (
                'No upcoming calls scheduled'
              )}
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
