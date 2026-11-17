/**
 * Editable Homepage Content — Florencia Nuñez
 *
 * Edit any copy, "Currently…" lines, spec sheet items, series numbers,
 * portrait/inspiration image paths, or links here without touching layout JSX.
 */

export const HOME_CONTENT = {
  seo: {
    title: 'Florencia Nuñez — Design & Real Estate, South Florida',
    description:
      'Florencia Nuñez — designer and real estate analyst in Broward County, South Florida. Every space, read twice: an eye for beauty and a mind for the numbers.',
    ogTitle: 'Florencia Nuñez — Design & Real Estate, South Florida',
    ogDescription:
      'Half mood board, half spreadsheet. Editorial design sensibility paired with South Florida real estate underwriting.',
    ogImage: '/images/investor-hero.jpg',
    ogType: 'website'
  },

  marquee: {
    items: [
      { text: 'Half mood board, half spreadsheet', variant: 'body' },
      { text: 'FLORENCIA NUÑEZ', variant: 'caps' },
      { text: 'Every space, read twice', variant: 'script' }
    ]
  },

  header: {
    wordmark: 'Florencia',
    wordmarkPeriod: '.',
    nav: [
      { label: 'ABOUT', href: '#about', targetId: 'about' },
      { label: 'DESIGN', href: '#design', targetId: 'design' },
      { label: 'REAL ESTATE', href: '#real-estate', targetId: 'real-estate' },
      { label: 'JOURNAL', href: '#journal', targetId: 'journal' },
      { label: 'WORK WITH ME', href: '#work-with-me', targetId: 'work-with-me' }
    ],
    login: {
      label: 'LOG IN',
      href: '/?route=login',
      route: 'login'
    }
  },

  hero: {
    monoLabel: 'DESIGNER / ANALYST / BROWARD COUNTY, FL',
    headingLine1: 'An eye for beauty.',
    headingLine2Italic: 'A mind for the numbers.',
    intro:
      'I’m Florencia Nuñez — a brand and spatial designer studying South Florida residential real estate from both sides of the table. Before I fall in love with the light in a room, I check what the block actually traded for.',
    primaryCta: {
      label: 'SEE HOW I THINK →',
      href: '#design',
      targetId: 'design'
    },
    secondaryCta: {
      label: 'READ THE JOURNAL',
      href: '#journal',
      targetId: 'journal'
    },
    portrait: {
      src: '/images/florencia/portrait.jpg',
      alt: 'Portrait of Florencia Nuñez, designer and real estate analyst in Broward County, South Florida',
      placeholderMono: 'PORTRAIT · PENDING FRAME',
      placeholderPath: 'public/images/florencia/portrait.jpg',
      figureCaption: 'fig. 01 — the designer',
      annotations: {
        scriptNote: 'warm light',
        pricePerSqftTag: '$/sf · 279',
        paletteTag: 'palette · #3A1418',
        paletteHex: '#3A1418'
      }
    }
  },

  readTwice: {
    eyebrow: 'DUAL LENS · 01',
    headingLine1: 'Every space,',
    headingLine2Italic: 'read twice.',
    subtitle:
      'First for how a room feels at four in the afternoon. Second for what county records, comparable sales, and renovation scope actually support.',
    image: {
      src: '/images/inspiration/timber-atrium.webp',
      alt: 'Sunlit indoor-outdoor lounge with curved oat linen sectional, vertical timber slat walls, skylight, and low oak tables',
      caption: 'fig. 02 — one room, two readings'
    },
    eye: {
      heading: 'the eye',
      tag: 'SENSIBILITY',
      items: [
        {
          title: 'Light',
          line: 'Where morning and late-afternoon sun land before a single switch is touched.'
        },
        {
          title: 'Proportion',
          line: 'Ceiling height, window rhythm, and whether a room breathes without moving structure.'
        },
        {
          title: 'Materials',
          line: 'Honest limewash, warm timber, unlacquered brass, and stone that ages quietly.'
        },
        {
          title: 'Flow',
          line: 'Sightlines that carry you effortlessly from the entry threshold out to the garden.'
        }
      ]
    },
    mind: {
      heading: 'the mind',
      tag: 'UNDERWRITING',
      items: [
        {
          title: 'Comps',
          line: 'Verified arm’s-length sales within 0.5 mi, weighted by recency and true condition.'
        },
        {
          title: '$ / sf',
          line: 'Living-area basis benchmarked against the submarket median with outliers stripped.'
        },
        {
          title: 'Rehab',
          line: 'Line-item scope priced with real trade allowances before emotion enters the room.'
        },
        {
          title: 'After-value',
          line: 'Conservative ARV anchored by renovated C2 sales — never wishful appreciation.'
        }
      ]
    }
  },

  system: {
    eyebrow: 'METHOD · 02',
    headingLine1: 'I have a system.',
    headingLine2Italic: 'Of course I do.',
    scriptNote: 'creative, but organized',
    steps: [
      {
        number: '01',
        title: 'Observe',
        description:
          'Walk the street, read the orientation and bones, and note what natural light and layout already give you for free.'
      },
      {
        number: '02',
        title: 'Measure',
        description:
          'Pull county parcel data, qualified sales, flood zone, millage, and reassessed non-homestead property taxes.'
      },
      {
        number: '03',
        title: 'Design',
        description:
          'Direct the material palette, elevation updates, and interior scope toward the details buyers and renters actually value.'
      },
      {
        number: '04',
        title: 'Prove',
        description:
          'Pressure-test cash to close, monthly carry, and exit scenarios until the spreadsheet agrees with the mood board.'
      }
    ]
  },

  currently: {
    headingLine1: 'Currently',
    headingItalicSuffix: '…',
    updatedMonthYear: 'NOVEMBER 2026',
    items: [
      {
        term: 'Studying',
        definition:
          '1950s–1970s Broward CBS ranch houses and small 2–4 unit layouts with courtyard potential.'
      },
      {
        term: 'Analyzing',
        definition:
          'Six-month $/sf spreads between unrenovated C4 sales and fully updated C2 comps across East Broward neighborhoods.'
      },
      {
        term: 'Building',
        definition:
          'Custom design-and-underwriting workflows linking room-by-room finish budgets directly to appraisal adjustment grids.'
      },
      {
        term: 'Shooting',
        definition:
          'Afternoon shadow studies on pale stucco, coastal foliage, and tactile interior details around Fort Lauderdale.'
      },
      {
        term: 'Planning',
        definition:
          'A live-in South Florida renovation — documented step by step from acquisition math to final styling.'
      }
    ]
  },

  series: {
    eyebrow: 'SERIES · NO. 01',
    headingLine1: 'Design it,',
    headingLine2Italic: 'then run the numbers.',
    intro:
      'An ongoing study pairing an architectural re-imagining of a South Florida property with its unvarnished acquisition and renovation math.',
    before: {
      tag: 'BEFORE · AS-IS',
      src: '/images/inspiration/stucco-and-shadow.webp',
      alt: 'Cream stucco Mediterranean facade with stone balustrade and sharp palm shadows representing the as-is study',
      caption: 'As-is study · 1,580 living sf · original interior & openings (UAD C4)'
    },
    after: {
      tag: 'AFTER · CONCEPT',
      src: '/images/inspiration/pool-pavilion.webp',
      alt: 'Weathered teak daybeds, ivory umbrella, and calm courtyard pool framed by palms representing the design concept',
      caption: 'Design direction · limewash envelope, kitchen-bath rework & courtyard pavilion (target C2)'
    },
    metrics: [
      {
        label: 'List',
        value: '$545,000',
        detail: '$345 / sf · as-is basis'
      },
      {
        label: 'Design budget',
        value: '$72,000',
        detail: 'interior, openings & courtyard'
      },
      {
        label: 'Est. after',
        value: '$715,000',
        detail: '$453 / sf · C2 comp median'
      }
    ],
    note: 'Concept for learning — not a listing, appraisal or offer.'
  },

  specSheet: {
    eyebrow: 'SPEC SHEET · 03',
    headingLine1: 'Florencia,',
    headingLine2Italic: 'itemized.',
    items: [
      {
        label: 'Based in',
        value: 'Broward County, South Florida'
      },
      {
        label: 'Thinks in',
        value: 'Floor plans, daylight angles, editorial type, and price per square foot'
      },
      {
        label: 'Collects',
        value: 'Linen & stone samples, architectural monographs, and neighborhood comp sheets'
      },
      {
        label: 'Weakness',
        value: 'Double espressos, arched openings, and good-bones houses with terrible listing photos'
      },
      {
        label: 'Believes',
        value: 'A space should move you at the doorway — and still hold up in a spreadsheet.'
      }
    ]
  },

  journal: {
    eyebrow: 'DISPATCHES · ARCHIVE',
    headingLine1: 'From the',
    headingLine2Italic: 'journal.',
    viewAllLabel: 'ALL ENTRIES →',
    viewAllRoute: 'news',
    defaultCategory: 'DESIGN & SPACE',
    emptyMessage: 'New journal entries arriving soon.'
  },

  newsletter: {
    eyebrow: 'THE NOTE · OCCASIONAL',
    headingLine1: 'One space, one number,',
    headingLine2Italic: 'one note.',
    description:
      'An occasional dispatch when there is something worth your time — a room worth studying, a real South Florida market number, and one concise takeaway.',
    inputLabel: 'Email address',
    inputPlaceholder: 'you@example.com',
    buttonLabel: 'SUBSCRIBE →',
    submittingLabel: 'SAVING…',
    consentText:
      'By subscribing, you agree to receive occasional email notes from Florencia Nuñez. Unsubscribe anytime.',
    successTitle: 'You’re on the list.',
    successMessage: 'Thank you for reading along — look out for the next note.'
  },

  workWithMe: {
    eyebrow: 'WORK WITH ME · STUDIO',
    headingLine1: 'Brand & web',
    headingLine2Italic: 'for design and real estate pros.',
    description:
      'Through my studio, I build custom brand identities and editorial websites for interior designers, architects, boutique developers, and property brands.',
    buttonLabel: 'VISIT THE STUDIO →',
    route: 'services',
    href: '/?route=services'
  },

  footer: {
    personName: 'Florencia Nuñez',
    rightsText: 'All rights reserved',
    links: [
      { label: 'Terms', href: '/?route=terms', route: 'terms' },
      { label: 'Privacy', href: '/?route=privacy', route: 'privacy' }
    ]
  }
};

/**
 * Splits a journal/blog title into a roman first part and an italic second part
 * so every post in "From the journal" follows the editorial heading rule.
 */
export function splitJournalTitle(rawTitle = '') {
  const title = String(rawTitle || '').trim();
  if (!title) {
    return { firstPart: 'Untitled', italicPart: '' };
  }

  // Prefer natural editorial punctuation splits (: or — or –)
  const colonIdx = title.indexOf(': ');
  if (colonIdx > 0 && colonIdx < title.length - 2) {
    return {
      firstPart: title.slice(0, colonIdx + 1),
      italicPart: title.slice(colonIdx + 2).trim()
    };
  }

  for (const sep of [' — ', ' – ', ' - ']) {
    const idx = title.indexOf(sep);
    if (idx > 0 && idx < title.length - sep.length) {
      return {
        firstPart: title.slice(0, idx) + ' —',
        italicPart: title.slice(idx + sep.length).trim()
      };
    }
  }

  const words = title.split(/\s+/);
  if (words.length <= 2) {
    return {
      firstPart: words[0],
      italicPart: words.slice(1).join(' ')
    };
  }

  const splitAt = Math.ceil(words.length * 0.55);
  return {
    firstPart: words.slice(0, splitAt).join(' '),
    italicPart: words.slice(splitAt).join(' ')
  };
}

/**
 * Resolves a concise uppercase mono category tag for a blog post.
 */
export function resolveJournalCategory(post = {}, fallback = 'DESIGN & SPACE') {
  if (post?.category && String(post.category).trim()) {
    return String(post.category).trim().toUpperCase();
  }
  const haystack = `${post?.title || ''} ${post?.excerpt || ''}`.toLowerCase();
  if (/(comp|sqft|\/sf|fha|appraisal|underwrit|cap rate|rehab|duplex|invest|market|tax)/.test(haystack)) {
    return 'REAL ESTATE';
  }
  if (/(pilates|studio|sauna|wellness|sanctuary|recovery)/.test(haystack)) {
    return 'SPACES · SOUTH FL';
  }
  if (/(brand|identity|website|typography|palette|interior|architect|light|stucco)/.test(haystack)) {
    return 'DESIGN';
  }
  return fallback;
}
