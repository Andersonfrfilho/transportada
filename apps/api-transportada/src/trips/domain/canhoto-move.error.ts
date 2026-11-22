/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D9/RF10: os recusos de "mover o canhoto para a NF certa". Todos são 409 — o pedido é
 * bem formado, mas o estado da viagem não deixa mover — e nenhuma mensagem leva número de nota,
 * série ou texto lido (RNF: só ids e códigos).
 */
import { ApiError } from '../../shared/api.error.js'

/** A prova de origem já tem veredito de gente (ou do código de barras): mover não passa por cima. */
export class CanhotoMoveSourceNotPendingError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_MOVE_SOURCE_NOT_PENDING',
      message: 'Only a pending canhoto can be moved to another document.',
      status: 409,
    })
  }
}

/** A leitura não aponta para a nota de destino: mover é correção do que o alerta mostra, nunca palpite. */
export class CanhotoMoveNotFlaggedForTargetError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_MOVE_NOT_FLAGGED_FOR_TARGET',
      message: 'The canhoto reading does not point to the target document.',
      status: 409,
    })
  }
}

/** Primeira versão: só dentro da mesma viagem (Q6). */
export class CanhotoMoveTargetNotInTripError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_MOVE_TARGET_NOT_IN_TRIP',
      message: 'The target document is not linked to this trip.',
      status: 409,
    })
  }
}

export class CanhotoMoveTargetAlreadyApprovedError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_MOVE_TARGET_ALREADY_APPROVED',
      message: 'The target document already has an approved canhoto.',
      status: 409,
    })
  }
}

/** A nota de destino já tem foto de canhoto (pendente ou recusada): trocar é "Substituir comprovante". */
export class CanhotoMoveTargetHasProofError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_MOVE_TARGET_HAS_PROOF',
      message: 'The target document already has a canhoto photo.',
      status: 409,
    })
  }
}

/** A foto mora no evento de entrega: nota ainda não entregue não tem onde receber o comprovante. */
export class CanhotoMoveTargetNotDeliveredError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_MOVE_TARGET_NOT_DELIVERED',
      message: 'The target document has no delivery to receive the canhoto.',
      status: 409,
    })
  }
}
