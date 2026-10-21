/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Spec 267: usuário de outra empresa, sem vínculo ativo, sem `occurrences.resolve` ou sem e-mail — sem dizer qual. */
export class OccurrenceWatcherNotEligibleError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_WATCHER_NOT_ELIGIBLE',
      message: 'User cannot be an occurrence watcher',
      status: 400,
    })
  }
}

export class OccurrenceWatcherListTooLongError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_WATCHER_LIST_TOO_LONG',
      message: 'Occurrence watcher list is full',
      status: 400,
    })
  }
}

export class OccurrenceWatcherNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_WATCHER_NOT_FOUND',
      message: 'Occurrence watcher was not found',
      status: 404,
    })
  }
}

/** Spec 267 RF7: `To` + `Cc` acima do teto do provedor. */
export class ContractorMailTooManyRecipientsError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS',
      message: 'Too many recipients for one e-mail',
      status: 400,
    })
  }
}
