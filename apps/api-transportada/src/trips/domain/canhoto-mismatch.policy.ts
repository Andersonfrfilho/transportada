/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D4/RF5: "a foto parece ser de outra nota". O alerta é **derivado** — compara o Nº/Série
 * que a leitura gravou na prova com os da nota a que a prova está anexada — e nunca é coluna: não há
 * segundo estado para divergir do primeiro. Esta política só compara e escolhe; não decide veredito
 * (ADR-0092 §5: o OCR só sugere) e não lê banco.
 *
 * ⚠️ A leitura exata é a única que alerta: distância 1 aqui geraria alerta falso (spec 344, casos
 * extremos). Zero à esquerda não é diferença ("000172195" é a NF 172195).
 */
import type { NfeDocumentStatus } from '../../database/nfe.schema.js'
import type { TripDeliveryProofCanhotoReview } from '../../database/trip.schema.js'

export const CANHOTO_MISMATCH_KINDS = ['other_document', 'other_series'] as const
export type CanhotoMismatchKind = (typeof CANHOTO_MISMATCH_KINDS)[number]

/**
 * A nota que a leitura aponta, sempre da **mesma empresa** da prova. `tripId`/`tripDocumentId` são
 * o vínculo vivo dela (mesma viagem preferida); `canhotoApproved` é a duplicidade da Q4 ("a NF X já
 * tem canhoto aprovado"). Nenhum dado de pessoa: número, série, estado e ids.
 */
export type CanhotoMismatchMatchedDocument = {
  readonly canhotoApproved: boolean
  readonly nfeDocumentId: string
  readonly number: string
  readonly sameTrip: boolean
  readonly series: string
  readonly status: NfeDocumentStatus
  readonly tripDocumentId: null | string
  readonly tripId: null | string
}

export type CanhotoMismatch = {
  readonly kind: CanhotoMismatchKind
  readonly matchedDocument: CanhotoMismatchMatchedDocument | null
  readonly readNumber: string
  readonly readSeries: null | string
}

/** O que a comparação precisa saber da prova e da nota dela. */
export type CanhotoReadingComparisonInput = {
  readonly expectedNumber: null | string
  readonly expectedSeries: null | string
  readonly readNumber: null | string | undefined
  readonly readSeries: null | string | undefined
  readonly review: TripDeliveryProofCanhotoReview | undefined
}

export type CanhotoReadingDivergence = {
  readonly kind: CanhotoMismatchKind
  readonly readNumber: string
  readonly readSeries: null | string
}

/** "000172195" e "172195" são o mesmo número; "000" é zero, não vazio. */
export function normalizeCanhotoDigits(value: string): string {
  const trimmed = value.trim().replace(/^0+/u, '')
  return trimmed === '' ? '0' : trimmed
}

/**
 * Os cinco casos da D4. Só a prova **pendente** alerta: aprovada ou recusada já tem decisão de gente
 * (ou do código de barras), e o alerta some com ela (RF5). Sem número lido, sem nota esperada: nada.
 */
export function compareCanhotoReading(
  input: CanhotoReadingComparisonInput,
): CanhotoReadingDivergence | null {
  if (input.review !== 'pending') return null
  if (input.readNumber === null || input.readNumber === undefined || input.readNumber === '') {
    return null
  }
  if (input.expectedNumber === null) return null

  const readNumber = normalizeCanhotoDigits(input.readNumber)
  const readSeries =
    input.readSeries === null || input.readSeries === undefined || input.readSeries === ''
      ? null
      : normalizeCanhotoDigits(input.readSeries)

  if (readNumber !== normalizeCanhotoDigits(input.expectedNumber)) {
    return { kind: 'other_document', readNumber, readSeries }
  }
  if (
    readSeries !== null &&
    input.expectedSeries !== null &&
    readSeries !== normalizeCanhotoDigits(input.expectedSeries)
  ) {
    return { kind: 'other_series', readNumber, readSeries }
  }
  return null
}

/** Uma nota da empresa com o número lido, como a consulta a devolve (um vínculo vivo no máximo). */
export type CanhotoMismatchCandidate = {
  readonly canhotoApproved: boolean
  readonly emitterTaxId: string
  readonly nfeDocumentId: string
  readonly number: string
  readonly series: string
  readonly status: NfeDocumentStatus
  readonly tripDocumentId: null | string
  readonly tripId: null | string
}

/**
 * Qual nota citar. O número da NF-e é por emitente e série, então a mesma empresa pode ter várias
 * "NF 172195": a da **mesma viagem** vence (é o caso real 931988/172195); depois a do **mesmo
 * emitente** da nota da prova; depois a única. Empate que sobra é `null` ("parece ser de outra
 * nota", com o número lido) — citar a nota errada custa mais confiança do que não citar nenhuma.
 */
export function pickCanhotoMismatchDocument(input: {
  readonly candidates: readonly CanhotoMismatchCandidate[]
  readonly currentTripId: string
  readonly divergence: CanhotoReadingDivergence
  readonly expectedEmitterTaxId: null | string
  readonly expectedNfeDocumentId: null | string
}): CanhotoMismatchMatchedDocument | null {
  const { divergence } = input
  const eligible = input.candidates.filter(
    (candidate) =>
      candidate.nfeDocumentId !== input.expectedNfeDocumentId &&
      normalizeCanhotoDigits(candidate.number) === divergence.readNumber &&
      (divergence.readSeries === null ||
        normalizeCanhotoDigits(candidate.series) === divergence.readSeries),
  )

  const chosen =
    single(eligible.filter((candidate) => candidate.tripId === input.currentTripId)) ??
    (input.expectedEmitterTaxId === null
      ? undefined
      : single(
          eligible.filter((candidate) => candidate.emitterTaxId === input.expectedEmitterTaxId),
        )) ??
    single(eligible)

  if (chosen === undefined) return null

  return {
    canhotoApproved: chosen.canhotoApproved,
    nfeDocumentId: chosen.nfeDocumentId,
    number: chosen.number,
    sameTrip: chosen.tripId === input.currentTripId,
    series: chosen.series,
    status: chosen.status,
    tripDocumentId: chosen.tripDocumentId,
    tripId: chosen.tripId,
  }
}

function single<T>(items: readonly T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined
}

/** O CNPJ (ou CPF com zeros) do emitente mora nas posições 7–20 da chave de acesso. */
export function readEmitterTaxIdFromAccessKey(accessKey: string): string {
  return accessKey.slice(6, 20)
}
