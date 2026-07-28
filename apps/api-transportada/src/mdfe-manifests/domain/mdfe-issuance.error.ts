/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import { MDFE_TRANSITION_BLOCK, type MdfeTransitionBlock } from './mdfe-manifest-state.policy.js'

const BLOCK_MESSAGE: Readonly<Record<MdfeTransitionBlock, string>> = {
  [MDFE_TRANSITION_BLOCK.alreadyCancelled]: 'The manifest is already cancelled.',
  [MDFE_TRANSITION_BLOCK.alreadyClosed]: 'The manifest is already closed and never cancels.',
  [MDFE_TRANSITION_BLOCK.inFlight]: 'The manifest already has a request in flight.',
  [MDFE_TRANSITION_BLOCK.notAuthorized]: 'The manifest is not authorized by SEFAZ.',
  [MDFE_TRANSITION_BLOCK.notIssuable]: 'The manifest cannot be transmitted in its current state.',
  [MDFE_TRANSITION_BLOCK.windowExpired]: 'The cancellation window of the manifest expired.',
}

/** Prazo vencido é regra de negócio (422); os demais bloqueios são conflito de estado (409). */
const CONFLICT_STATUS = 409
const UNPROCESSABLE_STATUS = 422

export class MdfeManifestTransitionBlockedError extends ApiError {
  public constructor(reason: MdfeTransitionBlock) {
    super({
      code: reason,
      message: BLOCK_MESSAGE[reason],
      status:
        reason === MDFE_TRANSITION_BLOCK.windowExpired ? UNPROCESSABLE_STATUS : CONFLICT_STATUS,
    })
  }
}

export class MdfeIdempotencyKeyReusedError extends ApiError {
  public constructor() {
    super({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'The idempotency key was already used with a different request.',
      status: CONFLICT_STATUS,
    })
  }
}

export class MdfeCancellationJustificationError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_CANCELLATION_JUSTIFICATION_INVALID',
      message: 'The cancellation justification is shorter than SEFAZ accepts.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}
