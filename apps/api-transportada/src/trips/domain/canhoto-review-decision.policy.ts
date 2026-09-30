/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF26/RF27/RF28: quem decide o veredito do canhoto e o que fica gravado.
 *
 * A validação inteira mora aqui, e não no Zod da rota, porque o eixo é o mesmo para os dois canais:
 * a decisão humana entra por HTTP, e a leitura automática entra por dentro. As CHECK de
 * `trip_delivery_proofs` (`trip.schema.ts:1855-1930`) são a régua — o que este arquivo recusa é
 * exatamente o que o banco recusaria com 23514, e lá o defeito só apareceria em produção.
 */
import {
  TRIP_DELIVERY_PROOF_CANHOTO_BARCODE_READ_SOURCE,
  TRIP_DELIVERY_PROOF_CANHOTO_MANUAL_REVIEW_ORIGIN,
  TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_OTHER_REASON,
  type TripDeliveryProofCanhotoReadSource,
  type TripDeliveryProofCanhotoReview,
  type TripDeliveryProofCanhotoReviewOrigin,
  type TripDeliveryProofCanhotoReviewReason,
} from '../../database/trip.schema.js'
import { detectPersonalData } from '../../shared/personal-data.policy.js'
import {
  CanhotoAutomaticReviewInvalidError,
  CanhotoNotReviewableError,
  CanhotoReviewAlreadyResolvedError,
  CanhotoReviewNoteLengthError,
  CanhotoReviewNoteNotAllowedError,
  CanhotoReviewNotePersonalDataError,
  CanhotoReviewNoteRequiredError,
} from './canhoto-review.error.js'

const NOTE_MINIMUM_LENGTH = 20
const NOTE_MAXIMUM_LENGTH = 500

export type CanhotoReviewState = {
  readonly review: TripDeliveryProofCanhotoReview
  readonly reviewOrigin: TripDeliveryProofCanhotoReviewOrigin | null
}

export type ManualCanhotoReviewCommand =
  | Readonly<{ action: 'approve' }>
  | Readonly<{
      action: 'reject'
      note?: string
      reason: TripDeliveryProofCanhotoReviewReason
    }>

/**
 * T7.1: só o que a leitura **viu**. O veredito não entra aqui porque quem o produz é este arquivo —
 * a leitura roda no navegador (RF25), e aceitar o veredito dele devolveria a RF26 ao cliente.
 */
export type AutomaticCanhotoReviewCommand = Readonly<{
  readDocumentId: null | string
  readNumber: null | string
  readSeries: null | string
  readSource: TripDeliveryProofCanhotoReadSource | null
}>

type ManualReviewUpdate = {
  readonly canhotoReview: TripDeliveryProofCanhotoReview
  readonly canhotoReviewAt: Date
  readonly canhotoReviewByUserId: string
  readonly canhotoReviewNote: null | string
  readonly canhotoReviewOrigin: 'manual'
  readonly canhotoReviewReason: TripDeliveryProofCanhotoReviewReason | null
}

type AutomaticReviewUpdate = {
  readonly canhotoReadDocumentId: null | string
  readonly canhotoReadNumber: null | string
  readonly canhotoReadSeries: null | string
  readonly canhotoReadSource: TripDeliveryProofCanhotoReadSource | null
  readonly canhotoReview: TripDeliveryProofCanhotoReview
  readonly canhotoReviewAt: Date | null
  readonly canhotoReviewByUserId: null
  readonly canhotoReviewNote: null
  readonly canhotoReviewOrigin: 'automatic' | null
  readonly canhotoReviewReason: null
}

/** `unchanged` não é falha: é o reenvio que não deve gerar trilha nova (RF27). */
export type CanhotoReviewDecision<TUpdate> =
  | Readonly<{ kind: 'apply'; update: TUpdate }>
  | Readonly<{ kind: 'unchanged' }>

function assertReviewable(state: CanhotoReviewState): void {
  if (state.review === 'not_applicable') throw new CanhotoNotReviewableError()
}

/**
 * RF28: o texto livre é o único campo desta spec que uma pessoa digita, e é por onde dado pessoal
 * entra. A guarda é a mesma da spec 162 (`src/shared/`), de propósito.
 */
function resolveNote(command: ManualCanhotoReviewCommand): null | string {
  if (command.action === 'approve') return null

  const isOtherReason = command.reason === TRIP_DELIVERY_PROOF_CANHOTO_REVIEW_OTHER_REASON
  if (command.note === undefined) {
    if (isOtherReason) throw new CanhotoReviewNoteRequiredError()
    return null
  }
  if (!isOtherReason) throw new CanhotoReviewNoteNotAllowedError()
  if (command.note.length < NOTE_MINIMUM_LENGTH || command.note.length > NOTE_MAXIMUM_LENGTH) {
    throw new CanhotoReviewNoteLengthError()
  }

  const personalData = detectPersonalData(command.note)
  if (personalData !== undefined) throw new CanhotoReviewNotePersonalDataError(personalData)

  return command.note
}

/**
 * RF27: aprovar ou recusar é decisão de gente, e grava quem e quando. Repetir o mesmo veredito é
 * idempotente; trocar um veredito **humano** já dado é 409 — o caminho de volta é a recaptura.
 *
 * ⚠️ Aprovação automática **não** é fim de linha: a máquina só acerta o que leu, e RF26 existe
 * justamente para a pessoa poder recusar por cima dela.
 */
export function resolveManualCanhotoReview(input: {
  readonly actorUserId: string
  readonly command: ManualCanhotoReviewCommand
  readonly reviewedAt: Date
  readonly state: CanhotoReviewState
}): CanhotoReviewDecision<ManualReviewUpdate> {
  const { command, state } = input
  assertReviewable(state)

  const review = command.action === 'approve' ? 'approved' : 'rejected'
  const isHumanVerdict = state.reviewOrigin === TRIP_DELIVERY_PROOF_CANHOTO_MANUAL_REVIEW_ORIGIN
  if (isHumanVerdict) {
    if (state.review === review) return { kind: 'unchanged' }
    throw new CanhotoReviewAlreadyResolvedError()
  }

  const note = resolveNote(command)

  return {
    kind: 'apply',
    update: {
      canhotoReview: review,
      canhotoReviewAt: input.reviewedAt,
      canhotoReviewByUserId: input.actorUserId,
      canhotoReviewNote: note,
      canhotoReviewOrigin: TRIP_DELIVERY_PROOF_CANHOTO_MANUAL_REVIEW_ORIGIN,
      canhotoReviewReason: command.action === 'approve' ? null : command.reason,
    },
  }
}

/** As duas CHECK de forma da leitura: número e origem andam juntos, e série pede número. */
function assertReadingIsConsistent(command: AutomaticCanhotoReviewCommand): void {
  const hasNumber = command.readNumber !== null
  if (hasNumber !== (command.readSource !== null)) throw new CanhotoAutomaticReviewInvalidError()
  if (command.readSeries !== null && !hasNumber) throw new CanhotoAutomaticReviewInvalidError()
}

/**
 * RF26 como invariante do servidor (T7.1): as três condições da aprovação automática valem juntas
 * ou não valem — código de barras, a nota da rota, e o número **daquela** nota. O `documentNumber`
 * é a conferência que faltava: sem ela, "casou" seria só a palavra do navegador.
 *
 * Nunca `rejected`: máquina não recusa. O que ela não confirma vira trabalho de gente (RF29).
 */
function resolveAutomaticVerdict(input: {
  readonly command: AutomaticCanhotoReviewCommand
  readonly documentId: string
  readonly documentNumber: null | string
}): 'approved' | 'pending' {
  const { command } = input
  if (command.readSource !== TRIP_DELIVERY_PROOF_CANHOTO_BARCODE_READ_SOURCE) return 'pending'
  if (command.readDocumentId !== input.documentId) return 'pending'
  if (input.documentNumber === null || command.readNumber !== input.documentNumber) return 'pending'
  return 'approved'
}

/**
 * RF26: o código de barras aprova sozinho porque não interpreta — ou casou, ou não casou. O OCR
 * sugere: grava a leitura e deixa o veredito pendente, sem origem e sem instante, como a CHECK
 * `..._canhoto_review_at_check` exige.
 *
 * ⚠️ Sobre veredito humano, **nada** entra — nem a leitura. Reescrever o número por baixo de uma
 * recusa mudaria a prova depois da decisão, e a spec 220 é explícita: o automático nunca
 * sobrescreve o que uma pessoa decidiu.
 */
export function resolveAutomaticCanhotoReview(input: {
  readonly command: AutomaticCanhotoReviewCommand
  readonly documentId: string
  readonly documentNumber: null | string
  readonly reviewedAt: Date
  readonly state: CanhotoReviewState
}): CanhotoReviewDecision<AutomaticReviewUpdate> {
  const { command, state } = input
  assertReviewable(state)
  if (state.reviewOrigin === TRIP_DELIVERY_PROOF_CANHOTO_MANUAL_REVIEW_ORIGIN) {
    return { kind: 'unchanged' }
  }
  assertReadingIsConsistent(command)

  const review = resolveAutomaticVerdict({
    command,
    documentId: input.documentId,
    documentNumber: input.documentNumber,
  })
  const isApproved = review === 'approved'

  return {
    kind: 'apply',
    update: {
      canhotoReadDocumentId: command.readDocumentId,
      canhotoReadNumber: command.readNumber,
      canhotoReadSeries: command.readSeries,
      canhotoReadSource: command.readSource,
      canhotoReview: review,
      canhotoReviewAt: isApproved ? input.reviewedAt : null,
      canhotoReviewByUserId: null,
      canhotoReviewNote: null,
      canhotoReviewOrigin: isApproved ? 'automatic' : null,
      canhotoReviewReason: null,
    },
  }
}
