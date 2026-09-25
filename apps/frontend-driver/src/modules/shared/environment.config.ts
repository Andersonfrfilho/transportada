/* Cópia por valor de apps/frontend-client/src/modules/shared/environment.config.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * As apps não importam código uma da outra. Aqui `appBaseUrl` vem de `VITE_DRIVER_APP_URL`, que é
 * **obrigatória nesta app** — no painel a mesma variável é só um interruptor (ADR-0075 §6).
 */
type DriverEnvironment = {
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
    throw new Error(`DRIVER_CONFIGURATION_MISSING_${name}`)
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
    throw new Error(`DRIVER_CONFIGURATION_INVALID_${name}`)
  }

  return url.toString().replace(/\/$/, '')
}

export function getDriverEnvironment(): DriverEnvironment {
  return {
    apiBaseUrl: readTrustedUrl(import.meta.env.VITE_API_URL, 'VITE_API_URL'),
    appBaseUrl: readTrustedUrl(import.meta.env.VITE_DRIVER_APP_URL, 'VITE_DRIVER_APP_URL'),
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

/**
 * **Desligada por padrão**: a ausência da variável mantém o caminho de entrada como sempre foi.
 * Lida sozinha, e não pelo `getDriverEnvironment`, para poder ser consultada no caminho de entrada
 * mesmo onde a URL da API não está definida.
 */
export function isIdentifierFirstLoginEnabled(): boolean {
  return import.meta.env.VITE_IDENTIFIER_FIRST_LOGIN === 'true'
}
