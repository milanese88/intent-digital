/**
 * src/components/investor/PropertyTimeline.jsx
 *
 * Visual property lifecycle timeline:
 *   bought -> (demo) -> permits -> under construction -> completed -> listed -> sold
 *
 * Displays dates, values, and provenance sources for each milestone.
 * Automatically computes phase lengths:
 *   - Pre-construction / Permitting months
 *   - Construction months
 *   - On-market months
 *   - Total hold months
 *
 * Feeds automatically into Deal Breakdown holding and financing schedules.
 */

import React from 'react';
import { Button } from '../ui';
import { computeTimelinePhases } from './dealBreakdownEngine.js';

function fmtDollar(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return `$${Math.round(Number(n)).toLocaleString('en-US')}`;
}

function fmtDate(isoDate) {
  if (!isoDate) return '—';
  const match = String(isoDate).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return isoDate;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yr = match[1];
  const mo = monthNames[Number(match[2]) - 1] || 'Jan';
  return match[3] ? `${mo} ${Number(match[3])}, ${yr}` : `${mo} ${yr}`;
}

export default function PropertyTimeline({
  property = null,
  finderRow = null,
  breakdownInputs = null,
  permits = [],
  valueHistory = [],
  paRecord = null,
  onAddPermit = null,
  onUploadPaRecord = null,
  onApplyPhasesToBreakdown = null
}) {
  // Extract milestones from property, finderRow, inputs, permits, and PA record
  const buyPrice = breakdownInputs?.purchasePrice ?? finderRow?.buy_price ?? property?.purchase_price ?? null;
  const buyDate = breakdownInputs?.purchaseDate ?? finderRow?.buy_date ?? property?.purchase_date ?? null;
  const buySource = breakdownInputs?.purchaseSource === 'entered_by_me' ? 'Entered by me' : 'County deed';

  const exitPrice = breakdownInputs?.exitPrice ?? finderRow?.sell_price ?? property?.list_price ?? null;
  const exitDate = breakdownInputs?.exitDate ?? finderRow?.sell_date ?? null;
  const exitSource = breakdownInputs?.exitSource === 'my_list_price' ? 'My list price' : 'County resale deed';

  const yearBuilt =
    breakdownInputs?.afterYearBuilt ??
    property?.year_built ??
    paRecord?.buildingInfo?.yearBuilt ??
    finderRow?.year_built ??
    null;

  // Find permits of different types
  const demoPermit = permits.find((p) => p.permit_type === 'demolition');
  const structuralPermits = permits.filter((p) =>
    ['new_build', 'addition', 'remodel', 'pool', 'roof', 'mep'].includes(p.permit_type)
  );
  const earliestPermit = [...permits].sort((a, b) => (a.issue_date || '').localeCompare(b.issue_date || ''))[0];
  const latestCompletedPermit = [...permits]
    .filter((p) => p.final_date)
    .sort((a, b) => (b.final_date || '').localeCompare(a.final_date || ''))[0];

  const completedDate = latestCompletedPermit?.final_date || (yearBuilt ? `${yearBuilt}-12-31` : null);

  const phases = computeTimelinePhases({
    buyDate,
    demoDate: demoPermit?.issue_date || null,
    permitDate: earliestPermit?.issue_date || null,
    completedDate,
    listDate: breakdownInputs?.exitSource === 'my_list_price' ? breakdownInputs?.exitDate : null,
    sellDate: breakdownInputs?.exitSource === 'county_resale' ? exitDate : null,
    dealType: breakdownInputs?.dealType || finderRow?.deal_type || 'flip'
  });

  // Construct milestone track items
  const milestones = [
    {
      id: 'bought',
      title: 'Bought',
      date: buyDate,
      value: buyPrice != null ? fmtDollar(buyPrice) : null,
      source: buySource,
      icon: '🏷️',
      color: '#34292A',
      desc: buyPrice ? `Acquired for ${fmtDollar(buyPrice)}` : 'Property acquired',
      active: Boolean(buyDate)
    }
  ];

  if (demoPermit || breakdownInputs?.dealType === 'demo_new_build') {
    milestones.push({
      id: 'demo',
      title: 'Demolition',
      date: demoPermit?.issue_date || null,
      value: demoPermit?.job_value ? fmtDollar(demoPermit.job_value) : (breakdownInputs?.demoCost ? fmtDollar(breakdownInputs.demoCost) : null),
      source: demoPermit?.source || 'Permit milestone',
      icon: '🚜',
      color: '#991B1B',
      desc: demoPermit ? `Demo permit #${demoPermit.permit_number || 'Filed'}` : 'Demolition phase',
      active: Boolean(demoPermit || breakdownInputs?.dealType === 'demo_new_build')
    });
  }

  milestones.push({
    id: 'permits',
    title: 'Permits',
    date: earliestPermit?.issue_date || null,
    value: permits.length > 0 ? `${permits.length} permit${permits.length > 1 ? 's' : ''}` : null,
    source: earliestPermit?.source || (permits.length > 0 ? 'City/County open data' : 'Pending'),
    icon: '📋',
    color: '#859DCE',
    desc: permits.length > 0 ? `${permits.length} permits issued (${structuralPermits.length} structural)` : 'No permits logged yet',
    active: permits.length > 0
  });

  milestones.push({
    id: 'under_construction',
    title: 'Under Construction',
    date: earliestPermit?.issue_date || null,
    value: valueHistory.length > 0 ? `Imp value: ${fmtDollar(valueHistory[0]?.improvementValue)}` : null,
    source: valueHistory.length > 0 ? 'County value history' : 'Active work',
    icon: '🔨',
    color: '#D97706',
    desc: `Active construction (${phases.constructionMonths} mo est.)`,
    active: Boolean(earliestPermit || breakdownInputs?.flipRehabLevel)
  });

  milestones.push({
    id: 'completed',
    title: 'Completed',
    date: completedDate,
    value: yearBuilt ? `Yr Built ${yearBuilt}` : null,
    source: latestCompletedPermit ? 'Final Inspection / CO' : 'County roll year built',
    icon: '🏠',
    color: '#1F5C3D',
    desc: yearBuilt ? `Structure completed (Built ${yearBuilt})` : 'Final inspection / CO',
    active: Boolean(yearBuilt || latestCompletedPermit)
  });

  if (breakdownInputs?.exitSource === 'my_list_price' || breakdownInputs?.exitDate) {
    milestones.push({
      id: 'listed',
      title: 'Listed',
      date: breakdownInputs?.exitSource === 'my_list_price' ? breakdownInputs?.exitDate : null,
      value: breakdownInputs?.exitSource === 'my_list_price' ? fmtDollar(exitPrice) : null,
      source: 'Entered list price',
      icon: '📣',
      color: '#4B5563',
      desc: exitPrice ? `Target list price ${fmtDollar(exitPrice)}` : 'On market',
      active: breakdownInputs?.exitSource === 'my_list_price'
    });
  }

  milestones.push({
    id: 'sold',
    title: 'Sold / Exit',
    date: exitDate,
    value: exitPrice != null ? fmtDollar(exitPrice) : null,
    source: exitSource,
    icon: '💰',
    color: '#34292A',
    desc: exitPrice ? `Closed sale at ${fmtDollar(exitPrice)}` : 'Exit closing',
    active: Boolean(exitDate && exitPrice)
  });

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '18px',
        border: '1px solid rgba(52, 41, 42, 0.12)',
        padding: '20px 22px',
        boxShadow: '0 4px 18px rgba(52, 41, 42, 0.04)'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-sans, "Montserrat", sans-serif)',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(52, 41, 42, 0.6)'
            }}
          >
            PROPERTY LIFECYCLE &amp; DEAL TIMELINE
          </span>
          <h3
            style={{
              margin: '2px 0 0 0',
              fontFamily: 'var(--font-heading, "Instrument Serif", Georgia, serif)',
              fontSize: '24px',
              fontWeight: 400,
              color: '#34292A'
            }}
          >
            Timeline &amp; Milestone Track
          </h3>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onUploadPaRecord && (
            <Button variant="outline" size="sm" onClick={onUploadPaRecord} style={{ fontSize: '11px' }}>
              📄 Upload PA Record (PDF)
            </Button>
          )}
          {onAddPermit && (
            <Button variant="secondary" size="sm" onClick={() => onAddPermit()} style={{ fontSize: '11px' }}>
              + Add permit
            </Button>
          )}
        </div>
      </div>

      {/* Phase Lengths Bar */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: '#FAF8F5',
          border: '1px solid rgba(52, 41, 42, 0.12)',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)' }}>
              Pre-Construction
            </span>
            <strong style={{ fontSize: '15px', color: '#34292A' }}>{phases.preConstructionMonths} mo</strong>
          </div>
          <div style={{ color: 'rgba(52, 41, 42, 0.3)' }}>&rarr;</div>
          <div>
            <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)' }}>
              Construction
            </span>
            <strong style={{ fontSize: '15px', color: '#D97706' }}>{phases.constructionMonths} mo</strong>
          </div>
          <div style={{ color: 'rgba(52, 41, 42, 0.3)' }}>&rarr;</div>
          <div>
            <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)' }}>
              On Market / Exit
            </span>
            <strong style={{ fontSize: '15px', color: '#1F5C3D' }}>{phases.onMarketMonths} mo</strong>
          </div>
          <div style={{ borderLeft: '1px solid rgba(52, 41, 42, 0.15)', paddingLeft: '16px' }}>
            <span style={{ display: 'block', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(52, 41, 42, 0.6)' }}>
              Total Hold Window
            </span>
            <strong style={{ fontSize: '15px', color: '#34292A' }}>{phases.totalHoldMonths} months</strong>
          </div>
        </div>

        {onApplyPhasesToBreakdown && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onApplyPhasesToBreakdown(phases)}
            style={{ fontSize: '10.5px', padding: '5px 12px' }}
          >
            Apply phase lengths to Deal Breakdown &rarr;
          </Button>
        )}
      </div>

      {/* Visual Timeline Nodes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(130px, 1fr))`,
          gap: '12px',
          position: 'relative'
        }}
      >
        {milestones.map((m, idx) => (
          <div
            key={m.id}
            style={{
              padding: '12px 12px',
              borderRadius: '12px',
              border: m.active ? `1.5px solid ${m.color}` : '1px dashed rgba(52, 41, 42, 0.2)',
              backgroundColor: m.active ? '#FAF8F5' : '#FFFFFF',
              opacity: m.active ? 1 : 0.6,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '18px' }}>{m.icon}</span>
              <span style={{ fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', color: m.color }}>
                Step {idx + 1}
              </span>
            </div>

            <div style={{ fontWeight: 700, fontSize: '12px', color: '#34292A', marginTop: '2px' }}>
              {m.title}
            </div>

            <div style={{ fontSize: '11px', color: 'rgba(52, 41, 42, 0.65)' }}>
              {fmtDate(m.date)}
            </div>

            {m.value && (
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#34292A', marginTop: '2px' }}>
                {m.value}
              </div>
            )}

            <div
              style={{
                fontSize: '9.5px',
                color: 'rgba(52, 41, 42, 0.55)',
                marginTop: 'auto',
                paddingTop: '6px',
                borderTop: '1px solid rgba(52, 41, 42, 0.08)'
              }}
            >
              {m.source}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
