/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3: a avaria e a devolução montadas de verdade, com um servidor dublado que aplica as MESMAS
 * regras da API (`cargo-arrival-occurrence.policy.ts`, `cargo-arrival-return.policy.ts`): janela, nota
 * esperada, item obrigatório, reenvio idempotente com a mesma chave, concluir só com a tratativa decidida.
 * ⚠️ `mock.module` não se desfaz e vale para o processo inteiro: os dois módulos são trocados **uma vez**,
 * aqui, e cada teste só reconfigura o dublê. A foto é dublada porque o canvas não existe no happy-dom.
 */
import { mock } from 'bun:test'
import { act } from 'react'

import type { CargoArrivalDetail } from '@/modules/cargo-receiving/shared/cargoArrival.types'
import type { CargoOccurrenceClient } from '@/modules/cargo-receiving/shared/cargoOccurrenceClient.service'
import type {
  CargoDocumentProduct,
  CargoOccurrenceCaseStatus,
  CargoOccurrenceView,
  CargoReturnAction,
  CargoReturnState,
  ReceivingOccurrenceType,
} from '@/modules/cargo-receiving/shared/cargoOccurrence.types'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import {
  buildOccurrence,
  buildOccurrencesView,
  DAMAGE_TYPE_ID,
  DEFAULT_PRODUCTS,
  RECEIVING_TYPES,
} from '../fixtures/cargoOccurrence.fixture'

export type RecordedRegistration = {
  arrivalId: string
  codes: string[]
  documentId: string
  fileSize: number
  idempotencyKey: string
  note: string
  quantities: string[]
  typeId: string
  units: string[]
}

export type RecordedReturn = {
  action: CargoReturnAction
  documentId: string
  note: string
  occurrenceId: string | undefined
}

export type CargoOccurrenceDouble = {
  readonly calls: {
    changeReturn: RecordedReturn[]
    listOccurrences: number
    listProducts: string[]
    listTypes: number
    register: RecordedRegistration[]
  }
  /** Fila de falhas: a próxima chamada de escrita rejeita com a primeira. */
  failures: Error[]
  /** Segura as respostas de escrita até `release()`. */
  isGated: boolean
  occurrences: CargoOccurrenceView[]
  readonly pending: (() => void)[]
  /** O tamanho da foto que o preparo devolve: acima de 512 KiB, o formulário a recusa. */
  photoBytes: number
  products: readonly CargoDocumentProduct[]
  readonly replays: Map<string, { fingerprint: string; occurrenceId: string }>
  readonly returns: Map<string, { occurrenceId: string | null; state: CargoReturnState }>
  types: readonly ReceivingOccurrenceType[]
}

export const cargoOccurrenceFakes: {
  client: CargoOccurrenceClient
  double: CargoOccurrenceDouble
} = {
  client: undefined as unknown as CargoOccurrenceClient,
  double: undefined as unknown as CargoOccurrenceDouble,
}

const refuse = (code: string, details: { field: string; message: string }[] = []) =>
  Promise.reject(new CargoReceivingRequestError(code, details))

/** A chegada que o dublê da chegada serve: a avaria lê nota, estado e janela dela, como a API lê do banco. */
let arrivalSource: () => CargoArrivalDetail = () => {
  throw new Error('ARRIVAL_SOURCE_NOT_BOUND')
}

export function bindArrivalSource(source: () => CargoArrivalDetail): void {
  arrivalSource = source
}

function readArrival() {
  const server = arrivalSource()
  const documents = server.groups.flatMap((group) => group.documents)
  return { documents, server }
}

/** O campo de texto do multipart: a lista fechada da API só manda `string` ou `File`. */
const readText = (form: FormData, field: string): string => {
  const value = form.get(field)
  return typeof value === 'string' ? value : ''
}

function readRegistration(input: {
  arrivalId: string
  documentId: string
  form: FormData
  idempotencyKey: string
}): RecordedRegistration {
  const { form } = input
  const file = form.get('file')
  return {
    arrivalId: input.arrivalId,
    codes: form.getAll('productCodes').map(String),
    documentId: input.documentId,
    fileSize: file instanceof Blob ? file.size : 0,
    idempotencyKey: input.idempotencyKey,
    note: readText(form, 'note'),
    quantities: form.getAll('productQuantities').map(String),
    typeId: readText(form, 'occurrenceTypeId'),
    units: form.getAll('productQuantityUnits').map(String),
  }
}

/** A mesma ordem de recusa da API: reenvio idempotente primeiro, depois chegada, nota, janela, tipo, itens, foto. */
function decideRegistration(
  double: CargoOccurrenceDouble,
  recorded: RecordedRegistration,
): Promise<never> | undefined {
  const { documents, server } = readArrival()
  const document = documents.find((item) => item.nfeDocumentId === recorded.documentId)
  const type = double.types.find((item) => item.id === recorded.typeId)
  const state = double.returns.get(recorded.documentId)?.state ?? 'none'
  if (server.status === 'closed') return refuse('CARGO_ARRIVAL_CLOSED')
  if (document === undefined) return refuse('CARGO_ARRIVAL_DOCUMENT_NOT_FOUND')
  if (state === 'returned') return refuse('CARGO_ARRIVAL_DOCUMENT_RETURNED')
  if (document.separationState === 'expected') return refuse('CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED')
  const due = server.separationDueAt
  if (due !== null && Date.now() > Date.parse(due)) {
    return refuse('CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED')
  }
  if (type === undefined) {
    return refuse('CARGO_ARRIVAL_OCCURRENCE_TYPE_NOT_FOUND', [
      { field: 'occurrenceTypeId', message: 'The occurrence type was not found' },
    ])
  }
  if (type.itemsMode !== 'off' && recorded.codes.length === 0) {
    return refuse('CARGO_ARRIVAL_OCCURRENCE_ITEMS_REQUIRED', [
      { field: 'productCodes', message: 'Choose at least one item of the document' },
    ])
  }
  if (recorded.fileSize === 0) return refuse('OCCURRENCE_PHOTO_REQUIRED')
  return undefined
}

function fingerprintOf(recorded: RecordedRegistration): string {
  const { arrivalId, codes, documentId, fileSize, note, quantities, typeId, units } = recorded
  return JSON.stringify([arrivalId, codes, documentId, fileSize, note, quantities, typeId, units])
}

function registerOccurrence(double: CargoOccurrenceDouble, recorded: RecordedRegistration) {
  const replay = double.replays.get(recorded.idempotencyKey)
  if (replay !== undefined) {
    if (replay.fingerprint !== fingerprintOf(recorded)) {
      return refuse('CARGO_ARRIVAL_OCCURRENCE_KEY_REUSED')
    }
    const existing = double.occurrences.find((item) => item.id === replay.occurrenceId)
    if (existing !== undefined) return Promise.resolve({ isReplay: true, occurrence: existing })
  }
  const refusal = decideRegistration(double, recorded)
  if (refusal !== undefined) return refusal
  const type = double.types.find((item) => item.id === recorded.typeId)
  const occurrence = buildOccurrence({
    case: { id: `case-${String(double.occurrences.length + 1)}`, status: 'recorded' },
    id: `occ-${String(double.occurrences.length + 1)}`,
    items: recorded.codes.map((code, index) => ({
      code,
      description: double.products.find((product) => product.code === code)?.description ?? code,
      quantity: recorded.quantities[index] === '' ? null : (recorded.quantities[index] ?? null),
      unit: recorded.units[index] === '' ? null : (recorded.units[index] ?? null),
    })),
    nfeDocumentId: recorded.documentId,
    note: recorded.note,
    occurrenceTypeId: recorded.typeId,
    typeName: type?.name ?? '',
  })
  double.occurrences.push(occurrence)
  double.replays.set(recorded.idempotencyKey, {
    fingerprint: fingerprintOf(recorded),
    occurrenceId: occurrence.id,
  })
  return Promise.resolve({ isReplay: false, occurrence })
}

const DECIDED: readonly CargoOccurrenceCaseStatus[] = ['decided', 'closed']

function decideReturn(
  double: CargoOccurrenceDouble,
  input: RecordedReturn,
): Promise<never> | undefined {
  const { documents, server } = readArrival()
  const current = double.returns.get(input.documentId) ?? {
    occurrenceId: null,
    state: 'none' as const,
  }
  const origin = double.occurrences.find(
    (item) => item.id === (input.occurrenceId ?? current.occurrenceId),
  )
  if (server.status === 'closed') return refuse('CARGO_ARRIVAL_CLOSED')
  if (input.action === 'mark') {
    if (current.state === 'returned') return refuse('CARGO_ARRIVAL_DOCUMENT_RETURNED')
    if (
      origin === undefined ||
      origin.nfeDocumentId !== input.documentId ||
      origin.cancelledAt !== null
    ) {
      return refuse('CARGO_ARRIVAL_RETURN_OCCURRENCE_INVALID')
    }
    const isLive = documents.find((item) => item.nfeDocumentId === input.documentId)?.isInLiveTrip
    if (current.state === 'none' && isLive === true)
      return refuse('CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP')
  }
  if (input.action === 'unmark' && current.state === 'returned')
    return refuse('CARGO_ARRIVAL_DOCUMENT_RETURNED')
  if (input.action === 'complete') {
    if (current.state === 'none') return refuse('CARGO_ARRIVAL_RETURN_NOT_MARKED')
    if (
      current.state === 'marked' &&
      origin?.case !== null &&
      !DECIDED.includes(origin?.case?.status ?? 'closed')
    ) {
      return refuse('CARGO_ARRIVAL_RETURN_DECISION_PENDING')
    }
  }
  return undefined
}

function changeReturn(double: CargoOccurrenceDouble, input: RecordedReturn) {
  const refusal = decideReturn(double, input)
  if (refusal !== undefined) return refusal
  const current = double.returns.get(input.documentId) ?? {
    occurrenceId: null,
    state: 'none' as const,
  }
  const next =
    input.action === 'mark'
      ? { occurrenceId: input.occurrenceId ?? null, state: 'marked' as const }
      : input.action === 'unmark'
        ? { occurrenceId: null, state: 'none' as const }
        : { occurrenceId: current.occurrenceId, state: 'returned' as const }
  const outcome = next.state === current.state ? ('unchanged' as const) : ('changed' as const)
  double.returns.set(input.documentId, next)
  return Promise.resolve({
    documentId: input.documentId,
    outcome,
    returnOccurrenceId: next.occurrenceId,
    returnToContractor: next.state,
  })
}

async function afterGate<TValue>(double: CargoOccurrenceDouble, run: () => Promise<TValue>) {
  if (double.isGated) await new Promise<void>((resolve) => double.pending.push(resolve))
  const failure = double.failures.shift()
  if (failure !== undefined) throw failure
  return run()
}

function buildClient(double: CargoOccurrenceDouble): CargoOccurrenceClient {
  return {
    changeReturn: (input) => {
      const recorded: RecordedReturn = {
        action: input.action,
        documentId: input.documentId,
        note: input.note,
        occurrenceId: input.occurrenceId,
      }
      // A chamada fica registrada ANTES da espera e da falha: o dublê prova o que a tela mandou, não o que deu certo.
      double.calls.changeReturn.push(recorded)
      return afterGate(double, () => changeReturn(double, recorded))
    },
    listDocumentProducts: ({ documentId }) => {
      double.calls.listProducts.push(documentId)
      return Promise.resolve(double.products)
    },
    listOccurrences: () => {
      double.calls.listOccurrences += 1
      return Promise.resolve(
        buildOccurrencesView({
          occurrences: double.occurrences,
          returns: [...double.returns].map(([nfeDocumentId, value]) => ({
            nfeDocumentId,
            returnOccurrenceId: value.occurrenceId,
            returnToContractor: value.state,
          })),
        }),
      )
    },
    listTypes: () => {
      double.calls.listTypes += 1
      return Promise.resolve(double.types)
    },
    registerOccurrence: (input) => {
      const recorded = readRegistration(input)
      double.calls.register.push(recorded)
      return afterGate(double, () => registerOccurrence(double, recorded))
    },
  }
}

export function installCargoOccurrenceDouble(
  overrides: Partial<CargoOccurrenceDouble> = {},
): CargoOccurrenceDouble {
  const double: CargoOccurrenceDouble = {
    calls: { changeReturn: [], listOccurrences: 0, listProducts: [], listTypes: 0, register: [] },
    failures: [],
    isGated: false,
    occurrences: [],
    pending: [],
    photoBytes: 4_096,
    products: DEFAULT_PRODUCTS,
    replays: new Map(),
    returns: new Map(),
    types: RECEIVING_TYPES,
    ...overrides,
  }
  cargoOccurrenceFakes.double = double
  cargoOccurrenceFakes.client = buildClient(double)
  return double
}

/** Põe a tratativa da avaria no estado pedido, como o escritório ou o contratante o fariam. */
export function setCaseStatus(
  double: CargoOccurrenceDouble,
  input: { occurrenceId: string; status: CargoOccurrenceCaseStatus },
): void {
  double.occurrences = double.occurrences.map((item) =>
    item.id === input.occurrenceId
      ? { ...item, case: { id: item.case?.id ?? `case-${item.id}`, status: input.status } }
      : item,
  )
}

/** Marca a nota como a API a deixaria depois de uma ocorrência e de um "devolver ao contratante". */
export function seedReturn(
  double: CargoOccurrenceDouble,
  input: { documentId: string; occurrence?: CargoOccurrenceView; state: CargoReturnState },
): void {
  if (input.occurrence !== undefined) double.occurrences.push(input.occurrence)
  double.returns.set(input.documentId, {
    occurrenceId: input.state === 'none' ? null : (input.occurrence?.id ?? null),
    state: input.state,
  })
}

export async function releaseOccurrenceGate(double: CargoOccurrenceDouble): Promise<void> {
  await act(async () => {
    for (const resolve of double.pending.splice(0)) resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

export function pngFile(name = 'avaria.jpg'): File {
  return new File([new Uint8Array(2_048)], name, { type: 'image/jpeg' })
}

/** O `FileField` lê `input.files` no `change`: o happy-dom não monta a lista sozinho. */
export async function chooseFile(input: HTMLInputElement, file: File): Promise<void> {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

void mock.module('@/modules/cargo-receiving/shared/cargoOccurrenceClient.service', () => ({
  getCargoOccurrenceClient: () => cargoOccurrenceFakes.client,
}))

void mock.module('@/modules/cargo-receiving/shared/cargoOccurrencePhoto.service', () => ({
  prepareOccurrencePhoto: (file: File) =>
    Promise.resolve({
      original: new Blob([new Uint8Array(cargoOccurrenceFakes.double.photoBytes)], {
        type: file.type === '' ? 'image/jpeg' : file.type,
      }),
      thumbnail: undefined,
    }),
}))

export { DAMAGE_TYPE_ID }
