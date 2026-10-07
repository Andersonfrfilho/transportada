/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceTypeOverridesReadPort } from '../application/resolve-document-occurrence-requirements.service.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from './drizzle-occurrence-attachment-overrides.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** As exceções de UM tipo (contratante e destinatário), lidas pelo mesmo repositório do registro. */
export function createOccurrenceTypeOverridesReader(
  queryable: TripQueryable,
): OccurrenceTypeOverridesReadPort {
  const repository = new DrizzleOccurrenceAttachmentOverridesRepository(queryable)
  return {
    findOccurrenceTypeOverrides: (input) =>
      repository.listOverridesForTypes({
        companyId: input.companyId,
        occurrenceTypeIds: [input.occurrenceTypeId],
      }),
  }
}
