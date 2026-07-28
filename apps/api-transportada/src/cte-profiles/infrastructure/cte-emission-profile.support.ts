/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'

const NAME_CONSTRAINT = 'cte_emission_profiles_company_id_name_unique'

export const NAME_TAKEN_SIGNAL = 'CTE_PROFILE_NAME_TAKEN'

export function isProfileNameConflict(error: unknown): boolean {
  return violatedUniqueConstraint(error) === NAME_CONSTRAINT
}
