/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripCargoLayout, TripCargoLayoutPoll } from './trip.types'
import type {
  TripReviewChange,
  TripReviewKeptNote,
  TripReviewPreview,
  TripReviewPreviewInput,
} from './tripReview.types'

/** Cópia por valor de `UNPLACED_REASONS` do pacote: o empate entre motivos segue esta ordem. */
const UNPLACED_REASON_ORDER = [
  'notMeasured',
  'largerThanBed',
  'bedFull',
  'tooMany',
  'time_budget',
] as const

const REVIEW_POLL_INTERVAL_MS = 2_000
/** O empacotador tem 120 s de prazo no caminhão maior (spec 145); três minutos cobrem a fila. */
const REVIEW_POLL_MAX_ATTEMPTS = 90

export const REVIEW_ERROR = {
  DOES_NOT_FIT: 'TRIP_DOCUMENT_REVIEW_DOES_NOT_FIT',
  LAYOUT_FAILED: 'TRIP_REVIEW_LAYOUT_FAILED',
  TARGET_WITHOUT_LAYOUT: 'TRIP_REVIEW_TARGET_WITHOUT_LAYOUT',
} as const

type UnplacedLine = Readonly<{
  count: number
  documentId?: null | string | undefined
  reason: string
}>

export type ReleasableNote = Readonly<{ boxCount: number; documentId: string; reason: string }>

function tallyByNote(unplaced: readonly UnplacedLine[]): Map<string, Map<string, number>> {
  const tally = new Map<string, Map<string, number>>()
  for (const line of unplaced) {
    if (line.documentId === undefined || line.documentId === null) continue
    const reasons = tally.get(line.documentId) ?? new Map<string, number>()
    reasons.set(line.reason, (reasons.get(line.reason) ?? 0) + line.count)
    tally.set(line.documentId, reasons)
  }
  return tally
}

function dominantReason(reasons: ReadonlyMap<string, number>): string {
  const ranked = UNPLACED_REASON_ORDER.filter((reason) => reasons.has(reason)).sort(
    (left, right) => (reasons.get(right) ?? 0) - (reasons.get(left) ?? 0),
  )
  return ranked[0] ?? [...reasons.keys()][0] ?? ''
}

/**
 * A mesma regra da API (`selectReleasableDocuments`): uma linha por nota; a nota com caixa cortada
 * pelo prazo ou sem medida fica no caminhão (D11). É ela que dá o N do botão.
 */
export function summarizeUnplacedNotes(unplaced: readonly UnplacedLine[]): Readonly<{
  kept: readonly TripReviewKeptNote[]
  releasable: readonly ReleasableNote[]
}> {
  const kept: TripReviewKeptNote[] = []
  const releasable: ReleasableNote[] = []
  for (const [documentId, reasons] of tallyByNote(unplaced)) {
    if (reasons.has('time_budget')) kept.push({ documentId, reason: 'time_budget' })
    else if (reasons.has('notMeasured')) kept.push({ documentId, reason: 'notMeasured' })
    else {
      const boxCount = [...reasons.values()].reduce((total, count) => total + count, 0)
      releasable.push({ boxCount, documentId, reason: dominantReason(reasons) })
    }
  }
  return { kept, releasable }
}

const deltaFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

/** D10: "+2,5%" é o caminhão mais pesado/cheio com a troca; ausência é ausência, nunca 0%. */
export function formatDeltaPercent(value: null | number): null | string {
  return value === null ? null : `${deltaFormatter.format(value)}%`
}

export function isDocumentLeftOut(layout: null | TripCargoLayout, nfeDocumentId: string): boolean {
  return layout?.placement?.unplaced.some((line) => line.documentId === nfeDocumentId) ?? false
}

export type ReviewChangeClient = Readonly<{
  moveReview: (
    input: Readonly<{ reviewId: string; targetTripId: string; validatedLayoutId: string }>,
  ) => Promise<unknown>
  previewReviewChange: (input: TripReviewPreviewInput) => Promise<TripReviewPreview>
  readCargoLayout: (input: Readonly<{ layoutId: string }>) => Promise<TripCargoLayoutPoll>
  swapReview: (
    input: Readonly<{ outTripDocumentId: string; reviewId: string; validatedLayoutId: string }>,
  ) => Promise<unknown>
}>

function previewInputOf(reviewId: string, change: TripReviewChange): TripReviewPreviewInput {
  return change.kind === 'move'
    ? { reviewId, targetTripId: change.targetTripId }
    : { outTripDocumentId: change.outTripDocumentId, reviewId }
}

async function waitForSettledLayout(params: {
  readonly client: ReviewChangeClient
  readonly layoutId: string
  readonly wait: (milliseconds: number) => Promise<void>
}): Promise<TripCargoLayoutPoll> {
  for (let attempt = 0; attempt < REVIEW_POLL_MAX_ATTEMPTS; attempt += 1) {
    const poll = await params.client.readCargoLayout({ layoutId: params.layoutId })
    if (poll.state.status !== 'pending') return poll
    await params.wait(REVIEW_POLL_INTERVAL_MS)
  }
  throw new Error(REVIEW_ERROR.LAYOUT_FAILED)
}

/**
 * Mover e trocar pelo mesmo caminho da API: a prévia pede a planta do destino **com** a nota, a tela
 * espera ela ficar pronta, e só grava com a planta validada — nota de fora é recusa, sem escrever.
 */
export async function runReviewChange(params: {
  readonly change: TripReviewChange
  readonly client: ReviewChangeClient
  readonly nfeDocumentId: string
  readonly reviewId: string
  readonly wait: (milliseconds: number) => Promise<void>
}): Promise<void> {
  const { change, client, reviewId } = params
  const preview = await client.previewReviewChange(previewInputOf(reviewId, change))
  if (preview.layoutId === null) throw new Error(REVIEW_ERROR.TARGET_WITHOUT_LAYOUT)

  const settled = await waitForSettledLayout({ ...params, layoutId: preview.layoutId })
  if (settled.state.status !== 'ready') throw new Error(REVIEW_ERROR.LAYOUT_FAILED)
  if (isDocumentLeftOut(settled.cargoLayout, params.nfeDocumentId)) {
    throw new Error(REVIEW_ERROR.DOES_NOT_FIT)
  }

  const validatedLayoutId = preview.layoutId
  if (change.kind === 'move') {
    await client.moveReview({ reviewId, targetTripId: change.targetTripId, validatedLayoutId })
    return
  }
  await client.swapReview({
    outTripDocumentId: change.outTripDocumentId,
    reviewId,
    validatedLayoutId,
  })
}

/** Os erros que a tela sabe explicar; o resto vira a frase genérica, nunca o código cru. */
const EXPLAINED_REVIEW_ERRORS = new Set<string>([
  ...Object.values(REVIEW_ERROR),
  'STATE_TRANSITION_NOT_ALLOWED',
  'TRIP_CARGO_LAYOUT_OUTDATED',
  'TRIP_CARGO_LAYOUT_NOT_READY',
  'TRIP_DOCUMENT_REVIEW_ALREADY_RESOLVED',
])

export function resolveReviewErrorKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return EXPLAINED_REVIEW_ERRORS.has(code)
    ? `reviewQueue.error.${code}`
    : 'reviewQueue.error.generic'
}

export function waitMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}
