/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4: o recebimento montado de verdade, com um servidor dublado que aplica as MESMAS
 * regras de transição da API (`cargo-arrival-transition.policy.ts`): esperada → recebida → separada,
 * uma etapa por vez, recusa por nota sem derrubar o lote. ⚠️ `mock.module` não se desfaz e vale para o
 * processo inteiro: o cliente é trocado **uma vez**, aqui, e cada teste só reconfigura o dublê.
 */
import { mock } from 'bun:test'
import { act } from 'react'

import type { CargoReceivingClient } from '@/modules/cargo-receiving/shared/cargoReceivingClient.service'
import type {
  AvailableCargoDocument,
  CargoArrivalDetail,
  CargoArrivalSummary,
  CargoDocumentOutcome,
  CargoDocumentState,
} from '@/modules/cargo-receiving/shared/cargoArrival.types'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import {
  ALFA_ID,
  ARRIVAL_ID,
  BETA_ID,
  buildDetail,
  buildSummary,
  withDocumentState,
} from '../fixtures/cargoReceiving.fixture'

export const CONTRACTORS = [
  { displayName: 'Alfa Indústria Fictícia', id: ALFA_ID, taxId: '11222333000181' },
  { displayName: 'Beta Comércio Fictício', id: BETA_ID, taxId: '22333444000162' },
  {
    displayName: 'Gama Distribuidora Fictícia',
    id: '00000000-0000-4000-8000-000000237a03',
    taxId: '33444555000143',
  },
] as const

const ENABLED_CONTRACTORS: ReadonlySet<string> = new Set([ALFA_ID, BETA_ID])

const NEXT_STATE: Readonly<Record<CargoDocumentState, CargoDocumentState | undefined>> = {
  expected: 'received',
  received: 'separated',
  separated: undefined,
}

export type DoubleCalls = {
  readonly assignRoute: { arrivalId: string; documentIds: readonly string[]; routeName: string | null }[]
  readonly batch: { documentIds: readonly string[]; to: string }[]
  readonly close: string[]
  readonly listArrivals: { cursor: string | null; filters: Record<string, string> }[]
  readonly register: { idempotencyKey: string; input: Record<string, unknown> }[]
}

export type CargoReceivingDouble = {
  arrivals: readonly CargoArrivalSummary[]
  readonly available: AvailableCargoDocument[]
  readonly calls: DoubleCalls
  closeFailure: Error | undefined
  /** Fila de falhas: a próxima chamada de escrita rejeita com a primeira. */
  failures: Error[]
  /** Segura as respostas do lote até `release()`: é o que deixa o teste ver a tela otimista. */
  isGated: boolean
  readonly pending: (() => void)[]
  readonly refusals: Map<string, string>
  registerFailure: Error | undefined
  server: CargoArrivalDetail
  nextArrivalsCursor: string | null
}

export const cargoReceivingFakes: { client: CargoReceivingClient; double: CargoReceivingDouble } = {
  client: undefined as unknown as CargoReceivingClient,
  double: undefined as unknown as CargoReceivingDouble,
}

function transition(
  double: CargoReceivingDouble,
  request: { documentIds: readonly string[]; to: CargoDocumentState },
): readonly CargoDocumentOutcome[] {
  const documents = double.server.groups.flatMap((group) => group.documents)
  const changes: Record<string, CargoDocumentState> = {}
  const results = request.documentIds.map((documentId): CargoDocumentOutcome => {
    const document = documents.find((item) => item.nfeDocumentId === documentId)
    const refusal = double.refusals.get(`${request.to}:${documentId}`)
    if (document === undefined) {
      return { documentId, outcome: 'refused', reason: 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND' }
    }
    if (refusal !== undefined) return { documentId, outcome: 'refused', reason: refusal }
    if (double.server.status === 'closed') {
      return { documentId, outcome: 'refused', reason: 'CARGO_ARRIVAL_CLOSED' }
    }
    if (document.separationState === request.to) return { documentId, outcome: 'unchanged' }
    if (NEXT_STATE[document.separationState] === request.to) {
      changes[documentId] = request.to
      return { documentId, outcome: 'changed' }
    }
    return {
      documentId,
      outcome: 'refused',
      reason:
        document.separationState === 'expected'
          ? 'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED'
          : 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED',
    }
  })
  double.server = withDocumentState(double.server, changes)
  return results
}

function takeFailure(double: CargoReceivingDouble): Error | undefined {
  return double.failures.shift()
}

function buildClient(double: CargoReceivingDouble): CargoReceivingClient {
  return {
    assignRoute: (input) => {
      double.calls.assignRoute.push(structuredClone(input))
      return Promise.resolve([])
    },
    batchStatus: async (input) => {
      double.calls.batch.push({ documentIds: [...input.documentIds], to: input.to })
      if (double.isGated) await new Promise<void>((resolve) => double.pending.push(resolve))
      const failure = takeFailure(double)
      if (failure !== undefined) throw failure
      return transition(double, input)
    },
    closeArrival: (arrivalId) => {
      double.calls.close.push(arrivalId)
      if (double.closeFailure !== undefined) return Promise.reject(double.closeFailure)
      double.server = { ...double.server, status: 'closed' }
      return Promise.resolve({ arrivalId, outcome: 'changed' })
    },
    getArrival: () => Promise.resolve(double.server),
    listArrivals: (input) => {
      double.calls.listArrivals.push({ cursor: input.cursor, filters: { ...input.filters } })
      const isSecondPage = input.cursor !== null
      return Promise.resolve({
        items: isSecondPage ? [] : double.arrivals,
        nextCursor: isSecondPage ? null : double.nextArrivalsCursor,
      })
    },
    listAvailableDocuments: () => Promise.resolve({ items: double.available, nextCursor: null }),
    listContractors: () =>
      Promise.resolve({
        items: CONTRACTORS.map((contractor) => ({ ...contractor })),
        nextCursor: null,
      }),
    readReceivingEnabled: (contractorId) => Promise.resolve(ENABLED_CONTRACTORS.has(contractorId)),
    registerArrival: (input) => {
      double.calls.register.push(structuredClone(input) as DoubleCalls['register'][number])
      if (double.registerFailure !== undefined) return Promise.reject(double.registerFailure)
      return Promise.resolve({ arrival: double.server, isReplay: false })
    },
  }
}

export function installCargoReceivingDouble(
  overrides: Partial<CargoReceivingDouble> = {},
): CargoReceivingDouble {
  const double: CargoReceivingDouble = {
    arrivals: [buildSummary()],
    available: [],
    calls: { assignRoute: [], batch: [], close: [], listArrivals: [], register: [] },
    closeFailure: undefined,
    failures: [],
    isGated: false,
    nextArrivalsCursor: null,
    pending: [],
    refusals: new Map(),
    registerFailure: undefined,
    server: buildDetail({ id: ARRIVAL_ID }),
    ...overrides,
  }
  cargoReceivingFakes.double = double
  cargoReceivingFakes.client = buildClient(double)
  return double
}

/** Solta as respostas seguras do lote, na ordem em que chegaram. */
export async function release(double: CargoReceivingDouble): Promise<void> {
  await act(async () => {
    for (const resolve of double.pending.splice(0)) resolve()
    await Promise.resolve()
  })
}

export function networkFailure(): Error {
  return new CargoReceivingRequestError('REQUEST_FAILED')
}

void mock.module('@/modules/cargo-receiving/shared/cargoReceivingClient.service', () => ({
  getCargoReceivingClient: () => cargoReceivingFakes.client,
}))

export function resetLocation(path: string): void {
  window.history.replaceState({}, '', path)
}

export function buttonByText(text: string, root: ParentNode = document): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${text}`)
  return found
}

export function maybeButtonByText(
  text: string,
  root: ParentNode = document,
): HTMLButtonElement | undefined {
  return [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === text)
}

export function byLabel(label: string, root: ParentNode = document): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (found === null) throw new Error(`LABEL_NOT_FOUND:${label}`)
  return found
}

export function maybeByLabel(label: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[aria-label="${label}"]`)
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
}

export async function typeInto(field: HTMLInputElement, value: string): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

export function fieldByLabel(labelText: string): HTMLInputElement {
  const label = [...document.querySelectorAll('label')].find((element) =>
    (element.textContent ?? '').trim().startsWith(labelText),
  )
  const field = label?.querySelector<HTMLInputElement>('input')
  if (field === undefined || field === null) throw new Error(`FIELD_NOT_FOUND:${labelText}`)
  return field
}
