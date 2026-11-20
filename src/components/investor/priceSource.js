/**
 * Canonical Property Price Source & Purchase Basis Helpers
 *
 * Supports four property price sources:
 * - list_price           -> "List price" ("Ask $X")
 * - off_market_estimate  -> "Off-market estimate (Zillow/Realtor)" ("Off-market est. $X")
 * - my_offer             -> "My offer" ("My offer $X")
 * - county_value         -> "County value" ("County val. $X")
 *
 * Deal underwriting always uses "My offer" (offer_price) when set,
 * otherwise falls back to the property's primary reference price, clearly labeled.
 */

export const PRICE_SOURCE_OPTIONS = [
  {
    id: 'list_price',
    label: 'List price',
    shortLabel: 'List price',
    headerEyebrow: 'LIST PRICE',
    subjectPrefix: 'Ask',
    dealSourceLabel: 'List price',
    inputLabel: 'List Price'
  },
  {
    id: 'off_market_estimate',
    label: 'Off-market estimate (Zillow/Realtor)',
    shortLabel: 'Off-market estimate',
    headerEyebrow: 'OFF-MARKET ESTIMATE',
    subjectPrefix: 'Off-market est.',
    dealSourceLabel: 'Off-market estimate',
    inputLabel: 'Off-Market Estimate'
  },
  {
    id: 'my_offer',
    label: 'My offer',
    shortLabel: 'My offer',
    headerEyebrow: 'MY OFFER',
    subjectPrefix: 'My offer',
    dealSourceLabel: 'My offer',
    inputLabel: 'My Offer Price'
  },
  {
    id: 'county_value',
    label: 'County value',
    shortLabel: 'County value',
    headerEyebrow: 'COUNTY VALUE',
    subjectPrefix: 'County val.',
    dealSourceLabel: 'County value',
    inputLabel: 'County Market Value'
  }
];

export const VALID_PRICE_SOURCES = new Set(PRICE_SOURCE_OPTIONS.map((o) => o.id));

export function normalizePriceSource(raw) {
  if (!raw) return 'list_price';
  const k = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (VALID_PRICE_SOURCES.has(k)) return k;
  if (k.includes('off_market') || k.includes('zillow') || k.includes('realtor') || k.includes('estimate')) {
    return 'off_market_estimate';
  }
  if (k.includes('offer')) return 'my_offer';
  if (k.includes('county') || k.includes('just')) return 'county_value';
  return 'list_price';
}

export function getPriceSourceMeta(rawSource) {
  const id = normalizePriceSource(rawSource);
  return PRICE_SOURCE_OPTIONS.find((o) => o.id === id) || PRICE_SOURCE_OPTIONS[0];
}

function parsePositiveNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Resolves the property's primary price, optional My Offer, header labels,
 * Appraisal Subject column label, and Deal tab default purchase price + label.
 */
export function resolvePropertyPricing(property = {}, countyData = null) {
  const rawSource =
    property?.price_source ??
    property?.subject_details?.price_source ??
    'list_price';
  const priceSource = normalizePriceSource(rawSource);
  const meta = getPriceSourceMeta(priceSource);

  const enteredPrice = parsePositiveNum(property?.list_price);
  const countyJustVal = parsePositiveNum(countyData?.just_value ?? property?.just_value);
  const explicitOffer = parsePositiveNum(
    property?.offer_price ?? property?.subject_details?.offer_price
  );

  // Reference price displayed under the price source header
  const referencePrice =
    priceSource === 'county_value'
      ? (enteredPrice ?? countyJustVal)
      : enteredPrice;

  // "My offer" price: explicit offer_price if set, or enteredPrice when source itself is 'my_offer'
  const offerPrice =
    explicitOffer ?? (priceSource === 'my_offer' ? enteredPrice : null);

  // Deal tab uses "My offer" when set, otherwise the property's primary reference price
  const dealPurchasePrice = offerPrice ?? referencePrice ?? null;
  const dealPurchaseSource = offerPrice ? 'my_offer' : priceSource;
  const dealPurchaseLabel = offerPrice ? 'My offer' : meta.dealSourceLabel;

  const fmt = (val) => `$${Math.round(val).toLocaleString('en-US')}`;

  return {
    priceSource,
    meta,
    referencePrice,
    offerPrice,
    countyJustValue: countyJustVal,
    headerPriceLabel: meta.headerEyebrow,
    shortLabel: meta.shortLabel,
    subjectPrefix: meta.subjectPrefix,
    subjectColumnText: referencePrice ? `${meta.subjectPrefix} ${fmt(referencePrice)}` : null,
    unadjustedRowText: referencePrice ? `${fmt(referencePrice)} (${meta.subjectPrefix})` : '—',
    dealPurchasePrice,
    dealPurchaseSource,
    dealPurchaseLabel
  };
}
