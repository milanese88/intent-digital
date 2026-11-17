import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOME_CONTENT,
  splitJournalTitle,
  resolveJournalCategory
} from './home.js';
import newsletterHandler, {
  validateNewsletterEmail,
  checkNewsletterRateLimit
} from '../../api/newsletter.js';

test('HOME_CONTENT provides all required Florencia homepage sections, copy, and zero emoji', () => {
  assert.equal(HOME_CONTENT.seo.title, 'Florencia Nuñez — Design & Real Estate, South Florida');
  assert.equal(HOME_CONTENT.header.wordmark, 'Florencia');
  assert.equal(HOME_CONTENT.header.wordmarkPeriod, '.');

  assert.deepEqual(
    HOME_CONTENT.header.nav.map((n) => n.label),
    ['ABOUT', 'DESIGN', 'REAL ESTATE', 'JOURNAL', 'WORK WITH ME']
  );
  assert.equal(HOME_CONTENT.header.login.label, 'LOG IN');

  assert.deepEqual(
    HOME_CONTENT.marquee.items.map((m) => m.text),
    ['Half mood board, half spreadsheet', 'FLORENCIA NUÑEZ', 'Every space, read twice']
  );
  assert.equal(HOME_CONTENT.marquee.items[2].variant, 'script');

  assert.equal(HOME_CONTENT.hero.monoLabel, 'DESIGNER / ANALYST / BROWARD COUNTY, FL');
  assert.equal(HOME_CONTENT.hero.headingLine1, 'An eye for beauty.');
  assert.equal(HOME_CONTENT.hero.headingLine2Italic, 'A mind for the numbers.');
  assert.equal(HOME_CONTENT.hero.primaryCta.label, 'SEE HOW I THINK →');
  assert.equal(HOME_CONTENT.hero.secondaryCta.label, 'READ THE JOURNAL');
  assert.equal(HOME_CONTENT.hero.portrait.src, '/images/florencia/portrait.jpg');
  assert.equal(HOME_CONTENT.hero.portrait.figureCaption, 'fig. 01 — the designer');
  assert.equal(HOME_CONTENT.hero.portrait.annotations.scriptNote, 'warm light');
  assert.equal(HOME_CONTENT.hero.portrait.annotations.pricePerSqftTag, '$/sf · 279');
  assert.equal(HOME_CONTENT.hero.portrait.annotations.paletteTag, 'palette · #3A1418');

  assert.deepEqual(
    HOME_CONTENT.readTwice.eye.items.map((i) => i.title),
    ['Light', 'Proportion', 'Materials', 'Flow']
  );
  assert.deepEqual(
    HOME_CONTENT.readTwice.mind.items.map((i) => i.title),
    ['Comps', '$ / sf', 'Rehab', 'After-value']
  );

  assert.equal(HOME_CONTENT.system.scriptNote, 'creative, but organized');
  assert.deepEqual(
    HOME_CONTENT.system.steps.map((s) => `${s.number} ${s.title}`),
    ['01 Observe', '02 Measure', '03 Design', '04 Prove']
  );

  assert.deepEqual(
    HOME_CONTENT.currently.items.map((i) => i.term),
    ['Studying', 'Analyzing', 'Building', 'Shooting', 'Planning']
  );

  assert.deepEqual(
    HOME_CONTENT.series.metrics.map((m) => m.label),
    ['List', 'Design budget', 'Est. after']
  );
  assert.equal(
    HOME_CONTENT.series.note,
    'Concept for learning — not a listing, appraisal or offer.'
  );

  assert.deepEqual(
    HOME_CONTENT.specSheet.items.map((i) => i.label),
    ['Based in', 'Thinks in', 'Collects', 'Weakness', 'Believes']
  );

  // Verify no emoji characters anywhere in HOME_CONTENT
  const serialized = JSON.stringify(HOME_CONTENT);
  assert.equal(/\p{Extended_Pictographic}/u.test(serialized), false);
});

test('splitJournalTitle and resolveJournalCategory format journal entries with italic second part and mono category', () => {
  const colonSplit = splitJournalTitle(
    "The Case for the Pause: Inside Fort Lauderdale's New Recovery Sanctuary"
  );
  assert.equal(colonSplit.firstPart, 'The Case for the Pause:');
  assert.equal(colonSplit.italicPart, "Inside Fort Lauderdale's New Recovery Sanctuary");

  const plainSplit = splitJournalTitle('Why Broward Ranch Homes Still Make Sense');
  assert.ok(plainSplit.firstPart.length > 0);
  assert.ok(plainSplit.italicPart.length > 0);

  assert.equal(
    resolveJournalCategory({ title: 'Comp adjustments per sqft in Broward' }),
    'REAL ESTATE'
  );
  assert.equal(
    resolveJournalCategory({ title: 'Limewash and natural light in stucco rooms' }),
    'DESIGN'
  );
});

test('Newsletter validation, rate limiting, and honeypot handler work safely without DB writes for bots', async () => {
  assert.equal(validateNewsletterEmail('Florencia@Intent-Digital.com').valid, true);
  assert.equal(
    validateNewsletterEmail('Florencia@Intent-Digital.com').email,
    'florencia@intent-digital.com'
  );
  assert.equal(validateNewsletterEmail('not-an-email').valid, false);
  assert.equal(validateNewsletterEmail('').valid, false);

  const store = new Map();
  const t0 = 1_700_000_000_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(checkNewsletterRateLimit('203.0.113.10', t0 + i * 1000, store).allowed, true);
  }
  assert.equal(checkNewsletterRateLimit('203.0.113.10', t0 + 6000, store).allowed, false);
  // Resets after 15-minute window
  assert.equal(
    checkNewsletterRateLimit('203.0.113.10', t0 + 16 * 60 * 1000, store).allowed,
    true
  );

  // Honeypot short-circuits with 200 without touching database
  let statusOut = null;
  let jsonOut = null;
  const mockRes = {
    setHeader() {},
    status(c) {
      statusOut = c;
      return this;
    },
    json(b) {
      jsonOut = b;
      return this;
    }
  };

  await newsletterHandler(
    {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.7' },
      body: {
        email: 'bot@spam.example',
        company_website: 'https://spam.example'
      }
    },
    mockRes
  );
  assert.equal(statusOut, 200);
  assert.equal(jsonOut.ok, true);
});
