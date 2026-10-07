/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { CARGO_CASE_ACTION_SEGMENT, CARGO_CASE_PATHS } from './cargoOccurrenceCase.constant'
import type {
  CargoCaseResult,
  CargoSettlementItem,
  CargoSettlementView,
  ChangeCargoCaseInput,
} from './cargoOccurrenceCase.types'
import { toCaseResult, toSettlementView } from './cargoOccurrenceCaseResponse.validation'
import {
  requestCargoReceivingApi,
  type CargoReceivingDependencies,
} from './cargoReceivingRequest.service'

export type CargoOccurrenceCaseClient = Readonly<{
  changeCase: (input: ChangeCargoCaseInput) => Promise<CargoCaseResult>
  readSettlement: (occurrenceId: string) => Promise<CargoSettlementView>
  recordSettlement: (
    input: Readonly<{ items: readonly CargoSettlementItem[]; occurrenceId: string }>,
  ) => Promise<CargoSettlementView>
}>

/** As seis ações da tratativa e o acerto moram em `/trip-occurrences/:id/case/*`, com o `occurrence.id` da avaria. */
function casePath(occurrenceId: string): string {
  return `${CARGO_CASE_PATHS.occurrences}/${encodeURIComponent(occurrenceId)}/case`
}

/** O corpo é o do schema estrito da API: `{}` (sem corpo), `{ note }` ou `{ kind, note }` — chave a mais é 400. */
function buildCaseBody(input: ChangeCargoCaseInput): Readonly<Record<string, string>> | undefined {
  if (input.action === 'decide') return { kind: input.kind ?? '', note: input.note ?? '' }
  if (input.action === 'warehouse-return' || input.action === 'cancel') {
    return { note: input.note ?? '' }
  }
  return undefined
}

export function createCargoOccurrenceCaseClient(
  dependencies: CargoReceivingDependencies,
): CargoOccurrenceCaseClient {
  return {
    async changeCase(input) {
      const { body } = await requestCargoReceivingApi({
        body: buildCaseBody(input),
        dependencies,
        method: 'POST',
        path: `${casePath(input.occurrenceId)}/${CARGO_CASE_ACTION_SEGMENT[input.action]}`,
      })
      return toCaseResult(body)
    },
    async readSettlement(occurrenceId) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${casePath(occurrenceId)}/settlement`,
      })
      return toSettlementView(body)
    },
    async recordSettlement({ items, occurrenceId }) {
      const { body } = await requestCargoReceivingApi({
        body: { items },
        dependencies,
        method: 'PUT',
        path: `${casePath(occurrenceId)}/settlement`,
      })
      return toSettlementView(body)
    },
  }
}

export function getCargoOccurrenceCaseClient(): CargoOccurrenceCaseClient {
  return createCargoOccurrenceCaseClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
