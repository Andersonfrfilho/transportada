/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DiagnosableError } from '../../shared/diagnosable.error.js'

export const COMPANY_SETTINGS_PERSISTENCE_FAILURE = {
  profileNotPersisted: 'Company fiscal settings could not be persisted',
  sequenceNotPersisted: 'Company fiscal sequence could not be persisted',
} as const

type CompanySettingsPersistenceFailure =
  (typeof COMPANY_SETTINGS_PERSISTENCE_FAILURE)[keyof typeof COMPANY_SETTINGS_PERSISTENCE_FAILURE]

/** A mensagem vem só do catálogo acima, então pode ir para o log sem carregar dado da empresa. */
export class CompanySettingsPersistenceError extends DiagnosableError {
  public override readonly name = 'CompanySettingsPersistenceError'

  public constructor(failure: CompanySettingsPersistenceFailure) {
    super(failure)
  }
}
