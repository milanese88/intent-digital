/**
 * MLS / Realtor.com / Zillow Listing Details Text Parser
 *
 * Pure, deterministic parser that extracts structured residential property attributes
 * from pasted listing descriptions or MLS sheets so the user can review and confirm
 * each field before applying it to a Comp or Subject property.
 */

const CURRENT_YEAR = new Date().getFullYear();

function cleanInt(str) {
  if (!str) return null;
  const n = parseInt(String(str).replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function cleanFloat(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatSnippet(str, maxLen = 48) {
  if (!str) return '';
  const cleaned = String(str).replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

/**
 * Parses pasted MLS / Realtor / Zillow listing text into structured field candidates.
 *
 * Returns:
 * {
 *   fields: { ...normalizedKeyValues },
 *   items: [ { id, label, displayValue, snippet, patch, salePatch } ]
 * }
 */
export function parseListingDetailsText(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) {
    return { fields: {}, items: [] };
  }

  const normalized = text.replace(/\r\n?/g, '\n');
  const items = [];
  const fields = {};

  const addItem = (id, label, displayValue, snippet, patch = {}, salePatch = null) => {
    items.push({
      id,
      label,
      displayValue,
      snippet: formatSnippet(snippet),
      patch,
      salePatch
    });
    Object.assign(fields, patch, salePatch || {});
  };

  // 1. Beds
  let bedsMatch =
    normalized.match(/(?:bedrooms?|beds?|bdr)\s*[:#-]?\s*(\d{1,2})\b/i) ||
    normalized.match(/\b(\d{1,2})\s*(?:bedrooms?|beds?|bd|br)\b/i) ||
    normalized.match(/\b(\d{1,2})\s*\/\s*(\d{1,2}(?:\.5)?)\s*(?:bd\/ba|br\/ba|bed\/bath)/i);
  if (bedsMatch) {
    const beds = cleanInt(bedsMatch[1]);
    if (beds != null && beds >= 1 && beds <= 20) {
      addItem('beds', 'Beds', `${beds} bd`, bedsMatch[0], { beds });
    }
  }

  // 2. Baths (full + half, or decimal e.g. 3.5)
  const fullExplicit =
    normalized.match(/full\s*bath(?:room)?s?\s*[:#-]?\s*(\d{1,2})\b/i) ||
    normalized.match(/\b(\d{1,2})\s*full\s*bath(?:room)?s?\b/i) ||
    normalized.match(/\b(\d{1,2})\s*full\b(?=\s*[,/&]\s*\d{1,2}\s*half)/i);
  const halfExplicit =
    normalized.match(/half\s*bath(?:room)?s?\s*[:#-]?\s*(\d{1,2})\b/i) ||
    normalized.match(/\b(\d{1,2})\s*half\s*bath(?:room)?s?\b/i) ||
    normalized.match(/\b(\d{1,2})\s*half\b(?=\s*bath)?/i);

  if (fullExplicit) {
    const fullBaths = cleanInt(fullExplicit[1]);
    const halfBaths = halfExplicit ? (cleanInt(halfExplicit[1]) ?? 0) : 0;
    if (fullBaths != null && fullBaths >= 0 && fullBaths <= 25) {
      const display = halfBaths > 0 ? `${fullBaths} full, ${halfBaths} half ba` : `${fullBaths} full ba`;
      const snip = halfExplicit ? `${fullExplicit[0]} / ${halfExplicit[0]}` : fullExplicit[0];
      const totalBaths = fullBaths + (halfBaths ? 0.5 : 0);
      addItem('baths', 'Baths', display, snip, { full_baths: fullBaths, half_baths: halfBaths, baths: totalBaths });
    }
  } else {
    const bathDecimalMatch =
      normalized.match(/(?:total\s*)?bath(?:room)?s?\s*[:#-]?\s*(\d{1,2}(?:\.\d)?)\b/i) ||
      normalized.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:bath(?:room)?s?|ba)\b/i);
    if (bathDecimalMatch) {
      const total = cleanFloat(bathDecimalMatch[1]);
      if (total != null && total >= 0.5 && total <= 25) {
        const fullBaths = Math.floor(total + 1e-6);
        const halfBaths = total - fullBaths >= 0.25 ? 1 : 0;
        const display = halfBaths > 0 ? `${fullBaths} full, ${halfBaths} half ba` : `${fullBaths} full ba`;
        const totalBaths = fullBaths + (halfBaths ? 0.5 : 0);
        addItem('baths', 'Baths', display, bathDecimalMatch[0], { full_baths: fullBaths, half_baths: halfBaths, baths: totalBaths });
      }
    }
  }

  // 3. Lot size (extract first so we don't confuse lot sf with living sf)
  let lotSqft = null;
  let lotSnippet = '';
  const lotAcresMatch = normalized.match(/(?:lot\s*(?:size|area)?\s*[:#-]?\s*)?(\d+(?:\.\d+)?)\s*acres?\b/i);
  const lotSfMatch =
    normalized.match(/lot\s*(?:size|area|sq\.?\s*ft\.?|sqft)?\s*[:#-]?\s*([\d,]{3,7})\s*(?:sq\.?\s*ft\.?|sqft|sf)\b/i) ||
    normalized.match(/([\d,]{4,7})\s*(?:sq\.?\s*ft\.?|sqft|sf)\s*lot\b/i);
  if (lotSfMatch) {
    const v = cleanInt(lotSfMatch[1]);
    if (v && v >= 500 && v <= 5000000) {
      lotSqft = v;
      lotSnippet = lotSfMatch[0];
    }
  } else if (lotAcresMatch) {
    const acres = cleanFloat(lotAcresMatch[1]);
    if (acres && acres > 0.02 && acres <= 100) {
      lotSqft = Math.round(acres * 43560);
      lotSnippet = lotAcresMatch[0];
    }
  }
  if (lotSqft != null) {
    addItem('lot_sqft', 'Lot size', `${lotSqft.toLocaleString('en-US')} sf`, lotSnippet, {}, { lot_sqft: lotSqft });
  }

  // 4. Living Area (sqft) — exclude lot sf matches
  const textWithoutLot = lotSnippet ? normalized.replace(lotSnippet, ' ') : normalized;
  const sqftMatch =
    textWithoutLot.match(/(?:living\s*(?:area|sq\.?\s*ft\.?|sqft)|heated\s*(?:area|sq\.?\s*ft\.?)|area\s*under\s*air|gla|interior\s*area)\s*[:#-]?\s*([\d,]{3,6})\s*(?:sq\.?\s*ft\.?|sqft|sf)?/i) ||
    textWithoutLot.match(/\b([\d,]{3,6})\s*(?:sq\.?\s*ft\.?|sqft|sf)\b(?:\s*(?:living|under\s*air|a\/c|heated))?/i);
  if (sqftMatch) {
    const sf = cleanInt(sqftMatch[1]);
    if (sf && sf >= 300 && sf <= 50000) {
      addItem('sqft', 'Living area', `${sf.toLocaleString('en-US')} sf`, sqftMatch[0], {}, { sqft: sf });
    }
  }

  // 5. Year Built
  const ybMatch =
    normalized.match(/(?:year\s*built|yr\.?\s*built|built\s*(?:in)?)\s*[:#-]?\s*((?:19|20)\d{2})\b/i);
  if (ybMatch) {
    const yb = cleanInt(ybMatch[1]);
    if (yb && yb >= 1900 && yb <= CURRENT_YEAR + 1) {
      addItem('year_built', 'Year built', String(yb), ybMatch[0], {}, { year_built: yb });
    }
  }

  // 6. Construction (CBS / wood frame / other)
  const cbsMatch = normalized.match(/\b(cbs|concrete\s*block(?:\s*stucco)?|c\.?b\.?s\.?\s*construction|masonry(?:\s*block)?|block\s*\/\s*stucco|icf\s*construction)\b/i);
  const woodMatch = normalized.match(/\b(wood\s*frame|frame\s*\/\s*stucco|hardi[- ]?plank|hardie\s*(?:board|plank|siding)|fiber\s*cement\s*siding|frame\s*construction)\b/i);
  const steelMatch = normalized.match(/\b(steel\s*frame|modular\s*home|manufactured\s*home)\b/i);
  if (cbsMatch) {
    addItem('construction_type', 'Construction', 'CBS / Masonry', cbsMatch[0], {
      construction_type: 'cbs',
      construction_detail: formatSnippet(cbsMatch[0], 60)
    });
  } else if (woodMatch) {
    addItem('construction_type', 'Construction', 'Wood frame', woodMatch[0], {
      construction_type: 'wood_frame',
      construction_detail: formatSnippet(woodMatch[0], 60)
    });
  } else if (steelMatch) {
    addItem('construction_type', 'Construction', 'Other', steelMatch[0], {
      construction_type: 'other',
      construction_detail: formatSnippet(steelMatch[0], 60)
    });
  }

  // 7. Roof Type & Roof Year
  const tileRoof = normalized.match(/\b((?:barrel|concrete|clay|s-|flat|spanish)\s*tile(?:\s*roof)?|roof\s*[:#-]\s*tile)\b/i);
  const metalRoof = normalized.match(/\b((?:standing\s*seam\s*)?metal\s*roof(?:ing)?|aluminum\s*roof|roof\s*[:#-]\s*metal)\b/i);
  const shingleRoof = normalized.match(/\b((?:architectural|asphalt|comp(?:osition)?|dimensional)\s*shingle(?:\s*roof)?|shingle\s*roof|roof\s*[:#-]\s*shingle)\b/i);
  const flatRoof = normalized.match(/\b(flat\s*roof|built[- ]?up\s*roof|tpo\s*roof|modified\s*bitumen\s*roof|tar\s*(?:&|and)\s*gravel)\b/i);
  if (metalRoof) {
    addItem('roof_type', 'Roof type', 'Metal', metalRoof[0], { roof_type: 'metal' });
  } else if (tileRoof) {
    addItem('roof_type', 'Roof type', 'Barrel tile', tileRoof[0], { roof_type: 'barrel_tile' });
  } else if (shingleRoof) {
    addItem('roof_type', 'Roof type', 'Shingle', shingleRoof[0], { roof_type: 'shingle' });
  } else if (flatRoof) {
    addItem('roof_type', 'Roof type', 'Flat', flatRoof[0], { roof_type: 'flat' });
  }

  const roofYearMatch =
    normalized.match(/(?:roof\s*(?:year|yr|replaced|installed|updated|new)?\s*(?:in|:|-)?\s*)((?:19|20)\d{2})\b/i) ||
    normalized.match(/\b((?:19|20)\d{2})\s*(?:new\s*)?(?:(?:concrete|clay|barrel|s-|spanish|flat)\s*tile|(?:standing\s*seam\s*)?metal|(?:architectural|asphalt|comp(?:osition)?|dimensional)\s*shingle|tile|shingle|flat)?\s*roof\b/i);
  if (roofYearMatch) {
    const ry = cleanInt(roofYearMatch[1]);
    if (ry && ry >= 1950 && ry <= CURRENT_YEAR + 1) {
      addItem('roof_year', 'Roof year', String(ry), roofYearMatch[0], { roof_year: ry });
    }
  }

  // 8. Windows / Storm Protection
  const impactMatch = normalized.match(/\b((?:full\s*)?(?:hurricane\s*)?impact\s*(?:glass|windows?(?:\s*(?:&|and)\s*doors?)?|doors?)|hurricane\s*glass)\b/i);
  const shuttersMatch = normalized.match(/\b((?:accordion|hurricane|storm|roll[- ]?down|bahama)\s*shutters?)\b/i);
  const noStormMatch = normalized.match(/\b(no\s*(?:storm|hurricane)\s*protection|non[- ]?impact\s*windows?)\b/i);
  if (impactMatch) {
    addItem('windows', 'Windows', 'Impact', impactMatch[0], { windows: 'impact' });
  } else if (shuttersMatch) {
    addItem('windows', 'Windows', 'Shutters', shuttersMatch[0], { windows: 'shutters' });
  } else if (noStormMatch) {
    addItem('windows', 'Windows', 'None', noStormMatch[0], { windows: 'none' });
  }

  // 9. Pool & Screen Enclosure
  const noPoolMatch = normalized.match(/\b(no\s*(?:private\s*)?pool|pool\s*[:#-]\s*(?:no|none))\b/i);
  const resortPoolMatch = normalized.match(/\b(resort[- ]?style\s*pool|lagoon\s*pool|infinity\s*pool|(?:heated\s*)?saltwater\s*pool\s*(?:&|and|with)\s*spa|pool\s*(?:&|and|with)\s*(?:spa|waterfall|summer\s*kitchen))\b/i);
  const stdPoolMatch = normalized.match(/\b((?:private|in[- ]?ground|heated|saltwater|swimming)\s*pool|pool\s*[:#-]\s*yes|private\s*pool\s*home)\b/i);
  if (noPoolMatch) {
    addItem('pool_type', 'Pool', 'None', noPoolMatch[0], { pool_type: 'none', has_pool: false, screen_enclosure: false });
  } else if (resortPoolMatch) {
    addItem('pool_type', 'Pool', 'Resort pool', resortPoolMatch[0], { pool_type: 'resort', has_pool: true });
  } else if (stdPoolMatch) {
    addItem('pool_type', 'Pool', 'Standard pool', stdPoolMatch[0], { pool_type: 'standard', has_pool: true });
  }

  const screenMatch = normalized.match(/\b(screen(?:ed)?\s*(?:enclosure|patio|lanai|pool(?:\s*enclosure)?|porch)|pool\s*cage)\b/i);
  if (screenMatch && !noPoolMatch) {
    addItem('screen_enclosure', 'Screen enclosure', 'Yes', screenMatch[0], { screen_enclosure: true });
  }

  // 10. Waterfront & View
  const oceanAccessMatch = normalized.match(/\b(ocean\s*access|direct\s*(?:ocean|intracoastal|river)|no\s*fixed\s*bridges?|intracoastal\s*(?:front|waterway|view)?|deep\s*water|oceanfront)\b/i);
  const canalFixedMatch = normalized.match(/\b(fixed\s*bridge|canal\s*(?:front|view|lot|waterfront)|waterfront\s*canal)\b/i);
  const lakeMatch = normalized.match(/\b(lake\s*(?:front|view|lot)|lakefront|pond\s*view|long\s*lake\s*view|water\s*view)\b/i);
  const golfMatch = normalized.match(/\b(golf\s*(?:course|view|front|lot)|fairway\s*view)\b/i);
  const dryLotMatch = normalized.match(/\b(waterfront\s*[:#-]\s*(?:no|none)|dry\s*lot|interior\s*lot)\b/i);
  if (oceanAccessMatch) {
    addItem('waterfront_view', 'Waterfront / view', 'Ocean access', oceanAccessMatch[0], { waterfront_view: 'ocean_access' });
  } else if (canalFixedMatch) {
    addItem('waterfront_view', 'Waterfront / view', 'Canal (fixed bridge)', canalFixedMatch[0], { waterfront_view: 'canal_fixed_bridge' });
  } else if (lakeMatch) {
    addItem('waterfront_view', 'Waterfront / view', 'Lake', lakeMatch[0], { waterfront_view: 'lake' });
  } else if (golfMatch) {
    addItem('waterfront_view', 'Waterfront / view', 'Golf', golfMatch[0], { waterfront_view: 'golf' });
  } else if (dryLotMatch) {
    addItem('waterfront_view', 'Waterfront / view', 'Dry lot', dryLotMatch[0], { waterfront_view: 'dry_lot' });
  }

  // 11. Boat Dock & Boat Lift
  const noDockMatch = normalized.match(/\b(no\s*(?:boat\s*)?dock|dock\s*[:#-]\s*(?:no|none))\b/i);
  const dockSfMatch = normalized.match(/\b([\d,]{2,5})\s*(?:sq\.?\s*ft\.?|sqft|sf)\s*(?:private\s*)?(?:boat\s*)?dock\b/i)
    || normalized.match(/\b(?:boat\s*)?dock\s*[:#-]?\s*([\d,]{2,5})\s*(?:sq\.?\s*ft\.?|sqft|sf)\b/i);
  const dockMatch = normalized.match(/\b((?:private|deepwater|composite|wood|concrete)?\s*boat\s*dock|private\s*dock|dockage|\d+\s*(?:ft|foot|')\s*(?:private\s*)?dock)\b/i);
  const liftMatch = normalized.match(/\b((?:[\d,]+k?\s*(?:lb|pound)s?\s*)?boat\s*lift|hydraulic\s*lift|boat\s*davits)\b/i);

  if (noDockMatch) {
    addItem('boat_dock', 'Boat dock', 'No dock', noDockMatch[0], { boat_dock: false, boat_dock_sqft: null, boat_lift: false });
  } else if (dockSfMatch || dockMatch) {
    const dockSqft = dockSfMatch ? cleanInt(dockSfMatch[1]) : null;
    const labelVal = dockSqft ? `Yes (${dockSqft.toLocaleString('en-US')} sf)` : 'Yes';
    addItem('boat_dock', 'Boat dock', labelVal, (dockSfMatch || dockMatch)[0], {
      boat_dock: true,
      ...(dockSqft ? { boat_dock_sqft: dockSqft } : {})
    });
  }

  if (liftMatch && !noDockMatch) {
    addItem('boat_lift', 'Boat lift', 'Yes', liftMatch[0], { boat_lift: true, boat_dock: true });
  }

  // 12. Garage
  const noGarageMatch = normalized.match(/\b(no\s*garage|garage\s*(?:spaces?)?\s*[:#-]\s*(?:0|none|no))\b/i);
  const convertedGarMatch = normalized.match(/\b(converted\s*garage|garage\s*converted)\b/i);
  const garageBaysMatch =
    normalized.match(/\b([1-5])[- ]?(?:car|bay|cg)\s*garage\b/i) ||
    normalized.match(/garage\s*(?:spaces?|bays?|capacity)?\s*[:#-]?\s*([1-5])\b/i) ||
    normalized.match(/\b([1-4])\s*c\.?\s*g\.?\b/i);
  const carportMatch = normalized.match(/\b(carport)\b/i);

  if (noGarageMatch) {
    addItem('garage', 'Garage', 'None', noGarageMatch[0], { garage_type: 'none', garage_bays: 0 });
  } else if (convertedGarMatch) {
    addItem('garage', 'Garage', 'Converted', convertedGarMatch[0], { garage_type: 'converted', garage_bays: 0 });
  } else if (garageBaysMatch) {
    const bays = cleanInt(garageBaysMatch[1]);
    if (bays && bays >= 1 && bays <= 5) {
      addItem('garage', 'Garage', `${bays}-car garage`, garageBaysMatch[0], { garage_type: 'garage', garage_bays: Math.min(3, bays) });
    }
  } else if (carportMatch) {
    addItem('garage', 'Garage', 'Carport', carportMatch[0], { garage_type: 'carport', garage_bays: 0 });
  }

  // 13. HOA Fee & HOA Name
  const noHoaMatch = normalized.match(/\b(no\s*hoa|hoa\s*(?:fee)?\s*[:#-]\s*(?:\$?0\b|none|no))\b/i);
  const hoaFeeMatch =
    normalized.match(/hoa\s*(?:fee|dues|maintenance)?\s*[:#-]?\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*|per\s+)?(mo(?:nth(?:ly)?)?|qtr|quarter(?:ly)?|yr|year(?:ly)?|annual(?:ly)?)?/i) ||
    normalized.match(/\$\s*([\d,]+)\s*(?:\/\s*|per\s+)?(mo(?:nth)?|qtr|quarter|yr|year)\s*hoa\b/i);
  if (noHoaMatch) {
    addItem('hoa_monthly', 'HOA fee', '$0 / mo (No HOA)', noHoaMatch[0], {}, { hoa_monthly: 0, has_hoa: false });
  } else if (hoaFeeMatch) {
    const rawAmt = cleanFloat(hoaFeeMatch[1]);
    const freq = (hoaFeeMatch[2] || 'mo').toLowerCase();
    if (rawAmt != null && rawAmt >= 0 && rawAmt <= 50000) {
      let monthly = rawAmt;
      let freqNote = '/mo';
      if (freq.startsWith('q')) {
        monthly = Math.round(rawAmt / 3);
        freqNote = `/mo (from $${Math.round(rawAmt).toLocaleString()}/qtr)`;
      } else if (freq.startsWith('y') || freq.startsWith('a')) {
        monthly = Math.round(rawAmt / 12);
        freqNote = `/mo (from $${Math.round(rawAmt).toLocaleString()}/yr)`;
      } else {
        monthly = Math.round(rawAmt);
      }
      addItem('hoa_monthly', 'HOA fee', `$${monthly.toLocaleString('en-US')}${freqNote}`, hoaFeeMatch[0], {}, { hoa_monthly: monthly, has_hoa: monthly > 0 });
    }
  }

  const hoaNameMatch = normalized.match(/(?:hoa\s*name|association(?:\s*name)?|community|subdivision)\s*[:#-]\s*([A-Za-z0-9][A-Za-z0-9 &'.-]{2,55})(?:\n|$|\||·|•)/i);
  if (hoaNameMatch) {
    const hoaName = hoaNameMatch[1].trim().replace(/[.,;]+$/, '');
    if (hoaName && !/^(yes|no|none|n\/a|\$?\d+)$/i.test(hoaName)) {
      addItem('hoa_name', 'HOA / community', hoaName, hoaNameMatch[0], { hoa_name: hoaName });
    }
  }

  // 14. Condition & Kitchen/Baths Updated (strong text signals only)
  const newConstMatch = normalized.match(/\b(brand\s*new\s*construction|newly\s*constructed|never\s*lived\s*in)\b/i);
  const fullRenoMatch = normalized.match(/\b((?:completely|fully|totally|gut)\s*(?:renovated|remodeled)|turnkey\s*(?:renovated|remodel)|down\s*to\s*the\s*studs)\b/i);
  const updatedMatch = normalized.match(/\b((?:updated|remodeled|renovated)\s*(?:kitchen|baths?|bathrooms?)|new\s*kitchen\s*(?:&|and)\s*baths?)\b/i);
  const fixerMatch = normalized.match(/\b(needs?\s*(?:tlc|work|updating|renovation)|handyman\s*special|fixer[- ]?upper|as[- ]?is\s*investor\s*special)\b/i);
  if (newConstMatch) {
    addItem('condition', 'Condition', 'C1 · New', newConstMatch[0], { condition: 'c1', kitchen_baths_updated: true });
  } else if (fullRenoMatch) {
    addItem('condition', 'Condition', 'Fully renovated (C2)', fullRenoMatch[0], { condition: 'c2', kitchen_baths_updated: true });
  } else if (updatedMatch) {
    addItem('condition', 'Condition', 'Updated (C3)', updatedMatch[0], { condition: 'c3', kitchen_baths_updated: true });
  } else if (fixerMatch) {
    addItem('condition', 'Condition', 'C5 · Needs work', fixerMatch[0], { condition: 'c5', kitchen_baths_updated: false });
  }

  // 15. Fireplaces (captured for notes / display awareness)
  const fireplaceMatch = normalized.match(/\b(?:(\d)\s*)?fireplaces?\b/i);
  if (fireplaceMatch && !/\bno\s*fireplaces?\b/i.test(normalized)) {
    const count = fireplaceMatch[1] ? cleanInt(fireplaceMatch[1]) : 1;
    if (count && count >= 1 && count <= 10) {
      addItem('fireplaces', 'Fireplaces', `${count}`, fireplaceMatch[0], {}, { fireplaces: count });
    }
  }

  // 16. List Price / Asking Price / Sale Price
  const priceExplicitMatch =
    normalized.match(/(?:list(?:ing)?\s*price|asking\s*price|for\s*sale(?:\s*at)?|price)\s*[:#-]?\s*\$\s*([\d,]{4,10})\b/i) ||
    normalized.match(/\$\s*([\d,]{4,10})\b(?:\s*list(?:ing)?\s*price|\s*asking|\s*for\s*sale)/i);
  const priceGeneralMatch = normalized.match(/(?:^|\n|\b)\$\s*([\d,]{5,10})\b/);
  const matchedPrice = priceExplicitMatch || priceGeneralMatch;
  if (matchedPrice) {
    const pVal = cleanInt(matchedPrice[1]);
    if (pVal && pVal >= 25000 && pVal <= 100000000) {
      addItem('list_price', 'List price', `$${pVal.toLocaleString('en-US')}`, matchedPrice[0], { list_price: pVal, purchase_price: pVal }, { list_price: pVal, sale_price: pVal });
    }
  }

  return { fields, items, patch: fields };
}

