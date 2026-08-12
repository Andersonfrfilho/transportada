/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'

const NAME_CONSTRAINT = 'nfse_emission_profiles_company_id_name_unique'

export const NFSE_PROFILE_NAME_TAKEN_SIGNAL = 'NFSE_PROFILE_NAME_TAKEN'

export function isProfileNameConflict(error: unknown): boolean {
  return violatedUniqueConstraint(error) === NAME_CONSTRAINT
}
