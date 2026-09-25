/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * RF3 (ADR-0075 §2): a app não confere papel no front — quem decide é a API. `GET /me/trips/current`
 * exige `trip.read`; conta de escritório não tem essa permissão e recebe `403`. Sem rede ou com
 * qualquer outra resposta, a app segue como autorizada: barrar aqui seria repetir, cedo demais, a
 * decisão que a Fase 3 (RF6, boot sem rede) ainda vai tomar com o snapshot local.
 */
export type DriverAuthorizationStatus = 'authorized' | 'forbidden'

export type DriverAuthorizationDependencies = {
  readonly apiBaseUrl: string
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  readonly getAccessToken: () => Promise<string>
  readonly timeoutMs?: number
}

const CURRENT_TRIP_PATH = '/me/trips/current'
/**
 * Sinal fraco não derruba a conexão, pendura — e o boot com ela, depois do esqueleto. O mesmo
 * prazo da sonda do Keycloak: sem resposta nele, a app segue como autorizada.
 */
export const DRIVER_AUTHORIZATION_TIMEOUT_MS = 5_000

export async function checkDriverAuthorization(
  dependencies: DriverAuthorizationDependencies,
): Promise<DriverAuthorizationStatus> {
  try {
    const accessToken = await dependencies.getAccessToken()
    const response = await dependencies.fetch(
      new Request(`${dependencies.apiBaseUrl}${CURRENT_TRIP_PATH}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(dependencies.timeoutMs ?? DRIVER_AUTHORIZATION_TIMEOUT_MS),
      }),
    )

    return response.status === 403 ? 'forbidden' : 'authorized'
  } catch {
    return 'authorized'
  }
}
