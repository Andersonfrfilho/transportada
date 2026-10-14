/* Copyright (c) 2026 Ada Technology. MIT License. */
const COORDINATE_FORMAT = /^-?\d{1,3}(?:\.\d+)?$/u
const MAX_DECIMALS = 7
const AXIS_LIMIT = { latitude: 90, longitude: 180 } as const

export type StopPointCoordinateResult =
  | Readonly<{ ok: false; reason: 'empty' | 'format' | 'range' }>
  | Readonly<{ ok: true; value: string }>

/**
 * Deixa a coordenada digitada no formato que `PATCH /geocoded-addresses` aceita (ponto, até sete
 * casas) ou diz por que não dá — em vez de mandar e receber um `400` sem motivo.
 */
export function normalizeStopPointCoordinate(
  input: Readonly<{ axis: keyof typeof AXIS_LIMIT; value: string }>,
): StopPointCoordinateResult {
  const text = input.value.trim().replace(',', '.')
  if (text === '') return { ok: false, reason: 'empty' }
  if (!COORDINATE_FORMAT.test(text)) return { ok: false, reason: 'format' }
  if (Math.abs(Number(text)) > AXIS_LIMIT[input.axis]) return { ok: false, reason: 'range' }
  const [integer = '', decimals] = text.split('.')
  return {
    ok: true,
    value: decimals === undefined ? integer : `${integer}.${decimals.slice(0, MAX_DECIMALS)}`,
  }
}

/** Os endereços que `TRIP_ROUTE_STOPS_WITHOUT_LOCATION` traz em `details`; vazio para qualquer outro erro. */
export function readRouteStopsWithoutLocation(error: unknown): readonly string[] {
  if (!(error instanceof Error) || error.message !== 'TRIP_ROUTE_STOPS_WITHOUT_LOCATION') return []
  const details: unknown = (error as { details?: unknown }).details
  if (!Array.isArray(details)) return []
  return details.flatMap((detail: unknown) => {
    const message = (detail as { message?: unknown } | null)?.message
    return typeof message === 'string' ? [message] : []
  })
}
