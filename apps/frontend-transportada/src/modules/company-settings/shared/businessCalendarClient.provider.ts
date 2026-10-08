/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  listMunicipalityIdentities,
  type MunicipalityIdentity,
} from '@/modules/fleet/shared/municipality.service'

import {
  createBusinessCalendarClient,
  type BusinessCalendarClient,
} from './businessCalendarClient.service'

/** `state` é a sigla (`SP`): é o que o provedor do IBGE (BrasilAPI) aceita. */
export type MunicipalityDirectory = (
  input: Readonly<{ signal: AbortSignal; state: string }>,
) => Promise<readonly MunicipalityIdentity[]>

export function getBusinessCalendarClient(): BusinessCalendarClient {
  return createBusinessCalendarClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Município por código IBGE vem da mesma lista que o resto do painel usa (`municipality.service`): uma segunda
 * tabela de município discordaria da primeira.
 */
export function getMunicipalityDirectory(): MunicipalityDirectory {
  return ({ signal, state }) =>
    listMunicipalityIdentities({ fetch: globalThis.fetch.bind(globalThis), signal, state })
}
