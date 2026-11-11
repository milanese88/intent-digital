/**
 * Builds a Mapbox Static Images API URL for satellite-streets style.
 * Uses zoom 19 and a burgundy pin-s+41101b marker centered on lat/lng.
 */
export function getMapboxAerialUrl(lng, lat, width = 600, height = 400, zoom = 19) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN || '';
  if (!token || lng == null || lat == null) return null;

  const numLng = Number(lng);
  const numLat = Number(lat);
  if (isNaN(numLng) || isNaN(numLat)) return null;

  const w = Math.min(Math.max(Math.round(width), 1), 1280);
  const h = Math.min(Math.max(Math.round(height), 1), 1280);
  const z = Math.min(Math.max(Number(zoom) || 19, 0), 22);

  // Small burgundy marker: pin-s+41101b(lng,lat)
  const marker = `pin-s+41101b(${numLng.toFixed(6)},${numLat.toFixed(6)})`;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${marker}/${numLng.toFixed(6)},${numLat.toFixed(6)},${z},0/${w}x${h}@2x?access_token=${token}`;
}

/**
 * Builds a Mapbox Static Images API URL showing subject pin + numbered comp markers.
 * Uses auto bounding box to fit all points cleanly.
 */
export function getCmaStaticMapUrl(subject, comps = [], width = 720, height = 360) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN || '';
  if (!token || !subject?.lng || !subject?.lat) return null;

  const markers = [];
  const subLng = Number(subject.lng);
  const subLat = Number(subject.lat);
  if (!isNaN(subLng) && !isNaN(subLat)) {
    markers.push(`pin-s-star+41101b(${subLng.toFixed(6)},${subLat.toFixed(6)})`);
  }

  // Add up to 8 numbered comp pins
  comps.slice(0, 8).forEach((comp, idx) => {
    const cLng = Number(comp.lng);
    const cLat = Number(comp.lat);
    if (!isNaN(cLng) && !isNaN(cLat)) {
      const pinLabel = idx + 1;
      markers.push(`pin-s-${pinLabel}+34292a(${cLng.toFixed(6)},${cLat.toFixed(6)})`);
    }
  });

  if (markers.length === 0) return null;

  const markerStr = markers.join(',');
  const w = Math.min(Math.max(Math.round(width), 1), 1280);
  const h = Math.min(Math.max(Math.round(height), 1), 1280);

  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${markerStr}/auto/${w}x${h}@2x?access_token=${token}&padding=40,40,40,40`;
}
