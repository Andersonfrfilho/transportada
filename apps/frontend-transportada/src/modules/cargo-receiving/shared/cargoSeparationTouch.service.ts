/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CargoArrivalDocument,
  CargoDocumentOutcome,
  CargoDocumentState,
  CargoTransitionTarget,
} from './cargoArrival.types'
import type { DocumentStates } from './cargoDetailStates.service'

/** O envio do lote de estado: quem chama injeta o cliente, e a máquina fica pura. */
export type TouchSender = (
  request: Readonly<{ documentIds: readonly string[]; to: CargoTransitionTarget }>,
) => Promise<readonly CargoDocumentOutcome[]>

/**
 * O resultado de um toque: um resultado por nota e o estado que cada uma tem DE FATO depois dele —
 * é o que a tela grava no cache, e é por ele que a nota recusada volta para onde estava.
 */
export type TouchRun = Readonly<{
  results: readonly CargoDocumentOutcome[]
  states: DocumentStates
}>

export type GroupSeparationPlan = Readonly<{
  receiveIds: readonly string[]
  separateIds: readonly string[]
}>

const NEXT_TARGET: Readonly<Record<CargoDocumentState, CargoTransitionTarget | undefined>> = {
  expected: 'received',
  received: 'separated',
  separated: undefined,
}

const EMPTY_RUN: TouchRun = { results: [], states: {} }

export function resolveNextTouchTarget(
  state: CargoDocumentState,
): CargoTransitionTarget | undefined {
  return NEXT_TARGET[state]
}

/** A API só aceita `separated` a partir de `received`: a esperada passa pelos dois passos. */
export function planGroupSeparation(
  documents: readonly CargoArrivalDocument[],
): GroupSeparationPlan {
  return {
    receiveIds: documents
      .filter((document) => document.separationState === 'expected')
      .map((document) => document.nfeDocumentId),
    separateIds: documents
      .filter((document) => document.separationState !== 'separated')
      .map((document) => document.nfeDocumentId),
  }
}

/** O alvo da tela antes de o servidor responder: tudo que ainda não está separado vira separado. */
export function planOptimisticStates(documents: readonly CargoArrivalDocument[]): DocumentStates {
  return Object.fromEntries(
    documents
      .filter((document) => document.separationState !== 'separated')
      .map((document) => [document.nfeDocumentId, 'separated' as const]),
  )
}

type StepInput = Readonly<{
  documentIds: readonly string[]
  send: TouchSender
  to: CargoTransitionTarget
}>

async function runStep({
  documentIds,
  send,
  to,
}: StepInput): Promise<readonly CargoDocumentOutcome[]> {
  if (documentIds.length === 0) return []
  return send({ documentIds, to })
}

function isRefused(outcome: CargoDocumentOutcome): boolean {
  return outcome.outcome === 'refused'
}

export async function runSingleTouch(
  input: Readonly<{ document: CargoArrivalDocument; send: TouchSender }>,
): Promise<TouchRun> {
  const to = resolveNextTouchTarget(input.document.separationState)
  if (to === undefined) return EMPTY_RUN
  const documentId = input.document.nfeDocumentId
  const results = await runStep({ documentIds: [documentId], send: input.send, to })
  const wasRefused = results.some(isRefused)
  return {
    results,
    states: { [documentId]: wasRefused ? input.document.separationState : to },
  }
}

/** O resultado final de uma nota que passou por dois passos: a recusa de qualquer um vence. */
function mergeOutcome(
  input: Readonly<{
    first: CargoDocumentOutcome | undefined
    second: CargoDocumentOutcome | undefined
  }>,
): CargoDocumentOutcome | undefined {
  const { first, second } = input
  if (first !== undefined && isRefused(first)) return first
  if (second !== undefined && isRefused(second)) return second
  if (first?.outcome === 'changed') return first
  return second ?? first
}

function resolveFinalState(
  input: Readonly<{
    document: CargoArrivalDocument
    received: CargoDocumentOutcome | undefined
    separated: CargoDocumentOutcome | undefined
  }>,
): CargoDocumentState {
  if (input.separated !== undefined && !isRefused(input.separated)) return 'separated'
  if (input.received !== undefined && !isRefused(input.received)) return 'received'
  return input.document.separationState
}

/**
 * Separar o grupo é DOIS lotes em ordem, porque o segundo depende do primeiro: a nota que o servidor
 * recusou no recebimento não entra no passo de separar, e as outras seguem — a recusa nunca derruba o
 * lote.
 */
export async function runGroupSeparation(
  input: Readonly<{ documents: readonly CargoArrivalDocument[]; send: TouchSender }>,
): Promise<TouchRun> {
  const plan = planGroupSeparation(input.documents)
  const received = await runStep({ documentIds: plan.receiveIds, send: input.send, to: 'received' })
  const refusedAtReceive = new Set(received.filter(isRefused).map((outcome) => outcome.documentId))
  const separated = await runStep({
    documentIds: plan.separateIds.filter((documentId) => !refusedAtReceive.has(documentId)),
    send: input.send,
    to: 'separated',
  })
  const outcomeOf = (
    input: Readonly<{ documentId: string; outcomes: readonly CargoDocumentOutcome[] }>,
  ) => input.outcomes.find((outcome) => outcome.documentId === input.documentId)
  const touched = input.documents.filter((document) =>
    plan.separateIds.includes(document.nfeDocumentId),
  )

  return {
    results: touched.flatMap((document) => {
      const merged = mergeOutcome({
        first: outcomeOf({ documentId: document.nfeDocumentId, outcomes: received }),
        second: outcomeOf({ documentId: document.nfeDocumentId, outcomes: separated }),
      })
      return merged === undefined ? [] : [merged]
    }),
    states: Object.fromEntries(
      touched.map((document) => [
        document.nfeDocumentId,
        resolveFinalState({
          document,
          received: outcomeOf({ documentId: document.nfeDocumentId, outcomes: received }),
          separated: outcomeOf({ documentId: document.nfeDocumentId, outcomes: separated }),
        }),
      ]),
    ),
  }
}
