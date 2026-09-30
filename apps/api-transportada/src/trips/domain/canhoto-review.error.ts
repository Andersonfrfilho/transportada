/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF27/RF28: os erros da conferência do canhoto. Cada um espelha uma CHECK de
 * `trip_delivery_proofs` — o que o domínio recusa aqui é exatamente o que o banco recusaria com
 * 23514, e o defeito só apareceria em produção.
 */
import { ApiError } from '../../shared/api.error.js'
import type { PersonalDataKind } from '../../shared/personal-data.policy.js'

export class CanhotoReviewProofNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_REVIEW_PROOF_NOT_FOUND',
      message: 'The delivery proof is not registered in this company.',
      status: 404,
    })
  }
}

/** Assinatura e foto da mercadoria não entram na fila: só o canhoto se confere (RF24). */
export class CanhotoNotReviewableError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_NOT_REVIEWABLE',
      message: 'This delivery proof is not subject to canhoto review.',
      status: 409,
    })
  }
}

/** Quem decide é gente, não o último clique: trocar veredito resolvido pede recaptura. */
export class CanhotoReviewAlreadyResolvedError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_REVIEW_ALREADY_RESOLVED',
      message: 'This canhoto already has another verdict.',
      status: 409,
    })
  }
}

export class CanhotoReviewNoteRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_REVIEW_NOTE_REQUIRED',
      message: 'The reason "other" requires a free-text note.',
      status: 400,
    })
  }
}

export class CanhotoReviewNoteNotAllowedError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_REVIEW_NOTE_NOT_ALLOWED',
      message: 'Only the reason "other" accepts a free-text note.',
      status: 400,
    })
  }
}

export class CanhotoReviewNoteLengthError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_REVIEW_NOTE_LENGTH',
      details: [{ field: 'note', message: 'between 20 and 500 characters' }],
      message: 'The free-text note has an unsupported length.',
      status: 400,
    })
  }
}

/** A categoria vai na resposta; o valor encontrado, nunca — a mensagem não pode vazar o dado. */
export class CanhotoReviewNotePersonalDataError extends ApiError {
  public constructor(kind: PersonalDataKind) {
    super({
      code: 'CANHOTO_REVIEW_NOTE_PERSONAL_DATA',
      details: [{ field: 'note', message: kind }],
      message: 'The free-text note carries personal data.',
      status: 400,
    })
  }
}

/** O painel pediu uma leitura que o banco recusaria: RF26, ou um par de colunas desemparelhado. */
export class CanhotoAutomaticReviewInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_AUTOMATIC_REVIEW_INVALID',
      message: 'The automatic reading is inconsistent.',
      status: 400,
    })
  }
}
