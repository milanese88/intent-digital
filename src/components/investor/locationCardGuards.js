/**
 * Strict Provenance Guards for Investor Studio Location Cards
 *
 * Guarantees:
 *  1. Zero value is ever rendered on Getting around, Schools, People & housing,
 *     or Safety unless backed by a non-empty `source` and valid `fetched_at`.
 *  2. Unavailable cards NEVER display a `source` line for data that wasn't fetched.
 *  3. People & housing allowlists ONLY age, income, owner/renter, rent, education,
 *     and vacancy (strictly excluding race/ethnicity).
 *  4. Safety renders ONLY agency-level FDLE stats with agency_name + report_year,
 *     otherwise hides the card.
 */

export const UNAVAILABLE_CARD_TEXT = 'Not available yet for this property';

export function hasValidSource(src) {
  return typeof src === 'string' && src.trim().length > 0;
}

export function formatSnapshotDate(rawDate) {
  if (!rawDate) return null;
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatCardProvenance({ address, fetched_at, source }, fallbackAddress = '') {
  const cleanAddr = String(address || fallbackAddress || '').trim();
  const dateLabel = formatSnapshotDate(fetched_at);
  if (!cleanAddr || !dateLabel || !hasValidSource(source)) {
    return null;
  }
  return `Data for: ${cleanAddr} · as of ${dateLabel} · ${source.trim()}`;
}

export function getFallbackSchoolLocator(county = '', lat = null) {
  const isPalmBeach =
    /palm/i.test(String(county || '')) ||
    (!county && lat != null && Number(lat) >= 26.33);

  if (isPalmBeach) {
    return {
      disclaimer: "Boundaries change — confirm with the district's school locator",
      locator_label: 'Palm Beach County Find My School',
      locator_url:
        'https://www.palmbeachschools.org/students_parents/school_choice/find_my_school'
    };
  }

  return {
    disclaimer: "Boundaries change — confirm with the district's school locator",
    locator_label: 'Broward Schools Locator',
    locator_url: 'https://www.browardschools.com/schoollocator'
  };
}

export function sanitizeGettingAroundCard(raw, propertyAddress = '') {
  const address = String(raw?.address || propertyAddress || '').trim();
  const provenanceLine =
    raw?.available === true
      ? formatCardProvenance(raw, propertyAddress)
      : null;

  if (!provenanceLine) {
    return {
      available: false,
      address,
      highways: [],
      places: [],
      provenanceLine: null
    };
  }

  const highways = Array.isArray(raw.highways)
    ? raw.highways.filter((h) => h && hasValidSource(h.source) && h.name)
    : [];
  const places = Array.isArray(raw.places)
    ? raw.places.filter((p) => p && hasValidSource(p.source) && p.name)
    : [];

  if (highways.length === 0 && places.length === 0) {
    return {
      available: false,
      address,
      highways: [],
      places: [],
      provenanceLine: null
    };
  }

  return {
    available: true,
    address,
    highways_imported: Boolean(raw.highways_imported),
    highways,
    places,
    provenanceLine
  };
}

export function sanitizeSchoolsCard(raw, propertyAddress = '', county = '', lat = null) {
  const address = String(raw?.address || propertyAddress || '').trim();
  const fallbackLoc = getFallbackSchoolLocator(county, lat);
  const disclaimer = raw?.disclaimer || fallbackLoc.disclaimer;
  const locatorLabel = raw?.locator_label || fallbackLoc.locator_label;
  const locatorUrl = raw?.locator_url || fallbackLoc.locator_url;

  const provenanceLine =
    raw?.available === true
      ? formatCardProvenance(raw, propertyAddress)
      : null;

  const schools = Array.isArray(raw?.schools)
    ? raw.schools.filter((s) => s && hasValidSource(s.source) && s.name)
    : [];

  if (!provenanceLine || schools.length === 0) {
    return {
      available: false,
      address,
      zone_verified: false,
      schools: [],
      disclaimer,
      locator_label: locatorLabel,
      locator_url: locatorUrl,
      provenanceLine: null
    };
  }

  return {
    available: true,
    address,
    zone_verified: Boolean(raw.zone_verified),
    schools,
    disclaimer,
    locator_label: locatorLabel,
    locator_url: locatorUrl,
    provenanceLine
  };
}

const ALLOWED_SOCIO_KEYS = [
  'median_age',
  'median_income',
  'owner_occupied_pct',
  'renter_occupied_pct',
  'median_rent',
  'bachelors_plus_pct',
  'vacancy_pct'
];

function pickAllowedSocio(obj) {
  if (!obj || typeof obj !== 'object' || !hasValidSource(obj.source)) return null;
  const out = { source: obj.source.trim() };
  let hasAnyMetric = false;
  for (const key of ALLOWED_SOCIO_KEYS) {
    const v = obj[key];
    if (v != null && Number.isFinite(Number(v))) {
      out[key] = Number(v);
      hasAnyMetric = true;
    } else {
      out[key] = null;
    }
  }
  return hasAnyMetric ? out : null;
}

export function sanitizePeopleHousingCard(raw, propertyAddress = '') {
  const address = String(raw?.address || propertyAddress || '').trim();
  const provenanceLine =
    raw?.available === true
      ? formatCardProvenance(raw, propertyAddress)
      : null;

  const tract = pickAllowedSocio(raw?.tract);
  const county = raw?.county && hasValidSource(raw?.county?.source) ? pickAllowedSocio(raw.county) : null;

  if (!provenanceLine || !tract || !raw?.tract_label || !raw?.survey_years) {
    return {
      available: false,
      address,
      tract: null,
      county: null,
      age_distribution: [],
      provenanceLine: null
    };
  }

  const ageDistribution = Array.isArray(raw.age_distribution)
    ? raw.age_distribution.filter(
        (row) =>
          row &&
          hasValidSource(row.source) &&
          row.tract_pct != null &&
          Number.isFinite(Number(row.tract_pct))
      )
    : [];

  return {
    available: true,
    address,
    tract_label: String(raw.tract_label),
    tract_number: String(raw.tract_number || ''),
    county_name: String(raw.county_name || 'County'),
    survey_years: String(raw.survey_years),
    tract,
    county,
    age_distribution: ageDistribution,
    provenanceLine
  };
}

export function sanitizeSafetyCard(raw, propertyAddress = '') {
  const address = String(raw?.address || propertyAddress || '').trim();
  if (!raw || raw.available !== true || raw.hidden === true) {
    return {
      available: false,
      hidden: true,
      address,
      provenanceLine: null
    };
  }

  const provenanceLine = formatCardProvenance(raw, propertyAddress);
  const reportYear = Number(raw.report_year);
  if (
    !provenanceLine ||
    !hasValidSource(raw.agency_name) ||
    !Number.isFinite(reportYear) ||
    (raw.violent_rate_per_100k == null && raw.property_rate_per_100k == null)
  ) {
    return {
      available: false,
      hidden: true,
      address,
      provenanceLine: null
    };
  }

  const history = Array.isArray(raw.history)
    ? raw.history.filter((h) => h && hasValidSource(h.source) && Number.isFinite(Number(h.year)))
    : [];

  return {
    available: true,
    hidden: false,
    address,
    agency_name: raw.agency_name.trim(),
    is_unincorporated: Boolean(raw.is_unincorporated),
    report_year: reportYear,
    population: raw.population != null ? Number(raw.population) : null,
    violent_count: raw.violent_count != null ? Number(raw.violent_count) : null,
    property_count: raw.property_count != null ? Number(raw.property_count) : null,
    violent_rate_per_100k:
      raw.violent_rate_per_100k != null ? Number(raw.violent_rate_per_100k) : null,
    property_rate_per_100k:
      raw.property_rate_per_100k != null ? Number(raw.property_rate_per_100k) : null,
    history,
    provenanceLine
  };
}
