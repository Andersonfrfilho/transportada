/* Copyright (c) 2026 Ada Technology. MIT License. */
const AUTH_ME_PATH = '/auth/me'

export function getApiBaseUrl(): string {
  const apiBaseUrl = process.env.VITE_API_URL
  if (apiBaseUrl === undefined || apiBaseUrl === '') {
    throw new Error('VITE_API_URL is required for authenticated smoke tests')
  }

  return apiBaseUrl.replace(/\/$/, '')
}

/**
 * A origem sozinha não identifica a resposta quando VITE_API_URL aponta para o proxy do Vite,
 * que serve frontend e API na mesma origem sob prefixos diferentes.
 */
export function isAuthMeResponseUrl(input: {
  readonly apiBaseUrl: string
  readonly url: string
}): boolean {
  const expected = new URL(`${input.apiBaseUrl.replace(/\/$/, '')}${AUTH_ME_PATH}`)
  const actual = new URL(input.url)

  return actual.origin === expected.origin && actual.pathname === expected.pathname
}
