/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: a exigência efetiva do tipo para a nota, como o registro do motorista a resolve
 * (`assessDriverOccurrence`): o tipo, a nota alcançável pela viagem do motorista (contratante e CNPJ do
 * destinatário lidos **da nota**, no servidor) e as exceções do tipo, campo a campo.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { resolveDocumentOccurrenceRequirements } from '../../trips/application/resolve-document-occurrence-requirements.service.js'
import { FIELD_TRIP_TARGET_KIND } from '../../trips/application/field-trip-target.types.js'
import { TripDocumentNotReachableError } from '../../trips/domain/trip.error.js'
import { findOccurrenceType } from '../../trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
import { findDriverReachableDocument } from '../../trips/infrastructure/driver-reachable-document.query.js'
import type { WhatsAppOccurrenceDraftPorts } from '../application/whatsapp-occurrence-draft.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createWhatsAppOccurrenceRequirementsReader(
  database: Database,
): WhatsAppOccurrenceDraftPorts['resolveRequirements'] {
  const overrides = new DrizzleOccurrenceAttachmentOverridesRepository(database)
  return async ({ companyId, documentId, driverId, occurrenceTypeId }) => {
    const [occurrenceType, document] = await Promise.all([
      findOccurrenceType(database, { companyId, occurrenceTypeId }),
      findDriverReachableDocument(database, {
        companyId,
        documentId,
        target: { driverId, kind: FIELD_TRIP_TARGET_KIND.driver },
      }),
    ])
    if (occurrenceType === null || document === null) return null
    try {
      const requirements = await resolveDocumentOccurrenceRequirements({
        companyId,
        document,
        occurrenceType,
        repository: {
          findOccurrenceTypeOverrides: (query) =>
            overrides.listOverridesForTypes({
              companyId: query.companyId,
              occurrenceTypeIds: [query.occurrenceTypeId],
            }),
        },
      })
      return {
        declaredAmountLabel: requirements.declaredAmountLabel,
        referenceNumberLabel: requirements.referenceNumberLabel,
        requirements,
      }
    } catch (error) {
      if (error instanceof TripDocumentNotReachableError) return null
      throw error
    }
  }
}
