/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108): as recusas do bloco "E-mail à contratante" do tipo de ocorrência — responsáveis em cópia
 * e destinatários escolhidos. Nenhuma revela se o id existe em outra empresa: fora da lista da empresa e de outra
 * empresa são o mesmo 404.
 */
import { ApiError } from '../../shared/api.error.js'

/** O usuário não está na lista de responsáveis da empresa (267), ou é de outra empresa: o mesmo 404. */
export class OccurrenceTypeWatcherNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_WATCHER_NOT_FOUND',
      message: 'The user is not in the occurrence watcher list of the company.',
      status: 404,
    })
  }
}

/** Mais responsáveis do que o teto da lista da empresa (`OCCURRENCE_WATCHER_MAX_ACTIVE`). */
export class OccurrenceTypeWatcherLimitError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_WATCHER_LIMIT',
      message: 'An occurrence type takes at most 10 watchers in copy.',
      status: 400,
    })
  }
}

/** Responsável **novo** no tipo que está inativo na lista da empresa; o já escolhido fica, marcado. */
export class OccurrenceTypeWatcherInactiveError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_WATCHER_INACTIVE',
      message: 'Only an active watcher of the company list can be added to an occurrence type.',
      status: 400,
    })
  }
}
