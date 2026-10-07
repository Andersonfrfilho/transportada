/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { CARGO_OCCURRENCE_PATHS } from './cargoOccurrence.constant'
import type {
  CargoDocumentProduct,
  CargoOccurrencesView,
  CargoReturnResult,
  ChangeCargoReturnInput,
  ReceivingOccurrenceType,
  RegisterCargoOccurrenceResult,
} from './cargoOccurrence.types'
import {
  toDocumentProducts,
  toOccurrencesView,
  toReceivingTypes,
  toRegisterOccurrenceResult,
  toReturnResult,
} from './cargoOccurrenceResponse.validation'
import { CARGO_RECEIVING_PATHS } from './cargoReceiving.constant'
import {
  requestCargoReceivingApi,
  type CargoReceivingDependencies,
} from './cargoReceivingRequest.service'

type DocumentScope = Readonly<{ arrivalId: string; documentId: string }>

export type CargoOccurrenceClient = Readonly<{
  changeReturn: (input: ChangeCargoReturnInput) => Promise<CargoReturnResult>
  listDocumentProducts: (input: DocumentScope) => Promise<readonly CargoDocumentProduct[]>
  listOccurrences: (arrivalId: string) => Promise<CargoOccurrencesView>
  listTypes: () => Promise<readonly ReceivingOccurrenceType[]>
  registerOccurrence: (
    input: DocumentScope & Readonly<{ form: FormData; idempotencyKey: string }>,
  ) => Promise<RegisterCargoOccurrenceResult>
}>

const RETURN_SEGMENT = {
  complete: 'return-complete',
  mark: 'return-mark',
  unmark: 'return-unmark',
} as const

function arrivalPath(arrivalId: string): string {
  return `${CARGO_RECEIVING_PATHS.arrivals}/${encodeURIComponent(arrivalId)}`
}

function documentPath(scope: DocumentScope): string {
  return `${arrivalPath(scope.arrivalId)}/documents/${encodeURIComponent(scope.documentId)}`
}

/** Marcar manda a avaria de origem; desfazer e concluir mandam só a observação. */
function buildReturnBody(input: ChangeCargoReturnInput): Readonly<Record<string, string>> {
  return input.action === 'mark' && input.occurrenceId !== undefined
    ? { note: input.note, occurrenceId: input.occurrenceId }
    : { note: input.note }
}

type ReadMethods = Pick<
  CargoOccurrenceClient,
  'listDocumentProducts' | 'listOccurrences' | 'listTypes'
>
type WriteMethods = Omit<CargoOccurrenceClient, keyof ReadMethods>

function createReadMethods(dependencies: CargoReceivingDependencies): ReadMethods {
  return {
    async listDocumentProducts(scope) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${documentPath(scope)}/products`,
      })
      return toDocumentProducts(body)
    },
    async listOccurrences(arrivalId) {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: `${arrivalPath(arrivalId)}/occurrences`,
      })
      return toOccurrencesView(body)
    },
    async listTypes() {
      const { body } = await requestCargoReceivingApi({
        dependencies,
        method: 'GET',
        path: CARGO_OCCURRENCE_PATHS.types,
      })
      return toReceivingTypes(body)
    },
  }
}

function createWriteMethods(dependencies: CargoReceivingDependencies): WriteMethods {
  return {
    async changeReturn(input) {
      const { body } = await requestCargoReceivingApi({
        body: buildReturnBody(input),
        dependencies,
        method: 'POST',
        path: `${documentPath(input)}/${RETURN_SEGMENT[input.action]}`,
      })
      return toReturnResult(body)
    },
    async registerOccurrence({ form, idempotencyKey, ...scope }) {
      const { body, status } = await requestCargoReceivingApi({
        dependencies,
        formData: form,
        idempotencyKey,
        method: 'POST',
        path: `${documentPath(scope)}/occurrences`,
      })
      return toRegisterOccurrenceResult({ payload: body, status })
    },
  }
}

export function createCargoOccurrenceClient(
  dependencies: CargoReceivingDependencies,
): CargoOccurrenceClient {
  return { ...createReadMethods(dependencies), ...createWriteMethods(dependencies) }
}

export function getCargoOccurrenceClient(): CargoOccurrenceClient {
  return createCargoOccurrenceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
