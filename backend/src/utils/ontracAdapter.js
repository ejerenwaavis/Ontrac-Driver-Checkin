/**
 * OnTrac API adapter — stubs for future integration.
 *
 * When OnTrac provides a photo/details API, set the corresponding
 * environment variables and the adapter will use them instead of
 * the local database values.
 *
 * Current behaviour: all functions fall back to the local DB value.
 */

/**
 * Resolve the URL to show for a driver's photo.
 * Uses ONTRAC_PHOTOS_URL if set, otherwise returns the local Cloudinary URL.
 *
 * @param {string} driverNumber
 * @param {string|null} fallbackUrl - the driver.photoUrl stored in MongoDB
 * @returns {string|null}
 */
export async function getDriverPhotoUrl(driverNumber, fallbackUrl) {
  const baseUrl = process.env.ONTRAC_PHOTOS_URL;
  if (!baseUrl) return fallbackUrl;

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/${encodeURIComponent(driverNumber)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return fallbackUrl;
    const data = await res.json();
    return data.photoUrl || fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}
