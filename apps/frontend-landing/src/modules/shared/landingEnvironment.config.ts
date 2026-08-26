/* Copyright (c) 2026 Ada Technology. MIT License. */

function readRequiredEnvironmentValue(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`LANDING_CONFIGURATION_MISSING_${name}`)
  }

  return value.trim()
}

export function readTrustedUrl(value: string | undefined, name: string): string {
  const url = new URL(readRequiredEnvironmentValue(value, name))

  const isLocalHttp = url.protocol === 'http:' && url.hostname === 'localhost'
  if (
    (url.protocol !== 'https:' && !isLocalHttp) ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`LANDING_CONFIGURATION_INVALID_${name}`)
  }

  return url.toString().replace(/\/$/, '')
}

export function getLandingApiBaseUrl(): string {
  return readTrustedUrl(import.meta.env.VITE_API_URL, 'VITE_API_URL')
}

/** Vazio (dev local) não renderiza o widget — a API aceita sem token quando o segredo dela também está ausente. */
export function getLandingTurnstileSiteKey(): string | undefined {
  const value = import.meta.env.VITE_TURNSTILE_SITE_KEY
  return value === undefined || value.trim() === '' ? undefined : value.trim()
}
