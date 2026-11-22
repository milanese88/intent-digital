/**
 * SSR render smoke entry for Investor Studio sections (built by Vite in tests).
 * Renders DealBreakdownSection / PropertyTimeline / FlipBuildFinder with rows produced
 * by the real `buildAnalyzeCandidateRow`, so render-time crashes (a missing import,
 * a null field) fail the test suite instead of white-screening the page.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import DealBreakdownSection from '../../src/components/investor/DealBreakdownSection.jsx';
import PropertyTimeline from '../../src/components/investor/PropertyTimeline.jsx';
import FlipBuildFinder from '../../src/components/investor/FlipBuildFinder.jsx';
import SectionErrorBoundary from '../../src/components/ui/SectionErrorBoundary.jsx';
import { buildAnalyzeCandidateRow } from '../../src/components/investor/dealBreakdownEngine.js';

export function renderScenario({ details, parcelData }) {
  const row = buildAnalyzeCandidateRow({ details, parcelData });
  return {
    row,
    breakdownHtml: renderToString(
      React.createElement(DealBreakdownSection, { finderRow: row, showToast: () => {} })
    ),
    timelineHtml: renderToString(
      React.createElement(PropertyTimeline, { finderRow: row, breakdownInputs: null, permits: null, valueHistory: null })
    )
  };
}

export function renderFinder() {
  return renderToString(React.createElement(FlipBuildFinder, {}));
}

/** Renders the boundary's fallback card as if a child had thrown. */
export function renderBoundaryFallback() {
  const original = console.error;
  console.error = () => {};
  try {
    const boundary = new SectionErrorBoundary({ section: 'test', label: 'this Deal Breakdown', children: null });
    boundary.state = SectionErrorBoundary.getDerivedStateFromError(new Error('boom'));
    boundary.componentDidCatch(new Error('boom'), { componentStack: '\n    at Broken' });
    return renderToString(boundary.render());
  } finally {
    console.error = original;
  }
}
