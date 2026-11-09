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
