export const STORAGE_KEYS = {
  accessToken: 'ontrac_access_token',
  refreshToken: 'ontrac_refresh_token',
  user: 'ontrac_user',
};

export const LEGACY_STORAGE_KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  user: 'user',
};

export function clearLegacyAuthKeys() {
  localStorage.removeItem(LEGACY_STORAGE_KEYS.accessToken);
  localStorage.removeItem(LEGACY_STORAGE_KEYS.refreshToken);
  localStorage.removeItem(LEGACY_STORAGE_KEYS.user);
}