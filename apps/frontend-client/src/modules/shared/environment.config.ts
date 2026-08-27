/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ⚠️ Cópia por valor de `identityEnvironment.config.ts` do painel: as apps não importam código uma da
 * outra (ADR-0050 §1), e é essa separação que impede uma falha de permissão no cliente do painel de
 * expor frota, financeiro e fiscal a um usuário externo.
 */
type ClientEnvironment = {
  readonly apiBaseUrl: string
  readonly appBaseUrl: string
  readonly keycloak: {
    readonly clientId: string
    readonly realm: string
    readonly url: string
  }
}

function readRequiredEnvironmentValue(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`CLIENT_CONFIGURATION_MISSING_${name}`)
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
    throw new Error(`CLIENT_CONFIGURATION_INVALID_${name}`)
  }

  return url.toString().replace(/\/$/, '')
}

export function getClientEnvironment(): ClientEnvironment {
  return {
    apiBaseUrl: readTrustedUrl(import.meta.env.VITE_API_URL, 'VITE_API_URL'),
    appBaseUrl: readTrustedUrl(import.meta.env.VITE_CLIENT_APP_URL, 'VITE_CLIENT_APP_URL'),
    keycloak: {
      clientId: readRequiredEnvironmentValue(
        import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
        'VITE_KEYCLOAK_CLIENT_ID',
      ),
      realm: readRequiredEnvironmentValue(
        import.meta.env.VITE_KEYCLOAK_REALM,
        'VITE_KEYCLOAK_REALM',
      ),
      url: readTrustedUrl(import.meta.env.VITE_KEYCLOAK_URL, 'VITE_KEYCLOAK_URL'),
    },
  }
}
