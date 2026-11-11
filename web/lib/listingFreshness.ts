export const LISTING_CONFIRMATION_INTERVAL_DAYS = 30

const CONFIRMATION_INTERVAL_MS = LISTING_CONFIRMATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000

export function isListingStale(lastConfirmedAt: string, now = Date.now()): boolean {
  const confirmedAt = new Date(lastConfirmedAt).getTime()
  return !Number.isFinite(confirmedAt) || now - confirmedAt >= CONFIRMATION_INTERVAL_MS
}
