/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Query params are allowlisted by the API; an empty selection must vanish instead of travelling as ''. */
export function cleanFleetFilters<TFilters extends object>(filters: TFilters): TFilters {
  const entries = Object.entries(filters).filter(
    ([, value]) => typeof value === 'string' && value.length > 0,
  )
  return Object.fromEntries(entries) as TFilters
}
