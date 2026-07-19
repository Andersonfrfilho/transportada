/* Copyright (c) 2026 Ada Technology. MIT License. */
type IdentityEnvironment = {
  readonly apiBaseUrl: string
  readonly keycloak: {
    readonly clientId: string
    readonly realm: string
    readonly url: string
  }
}

function readRequiredEnvironmentValue(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`IDENTITY_CONFIGURATION_MISSING_${name}`)
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
    throw new Error(`IDENTITY_CONFIGURATION_INVALID_${name}`)
  }

  return url.toString().replace(/\/$/, '')
}

export function getIdentityEnvironment(): IdentityEnvironment {
  return {
    apiBaseUrl: readTrustedUrl(import.meta.env.VITE_API_URL, 'VITE_API_URL'),
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
