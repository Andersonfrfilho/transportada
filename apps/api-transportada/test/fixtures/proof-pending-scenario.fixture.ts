/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 T4: o cenário do selo "canhoto pendente" contra o Postgres — notas baixadas pelo
 * escritório com e sem foto, sob a configuração que o teste grava. A baixa passa pela rota real,
 * então o estado lido depois é o que a produção produz, nunca linha inserida à mão.
 */
import { eq } from 'drizzle-orm'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../src/database/company-delivery-proof-settings.schema.js'
import { deliveryClients } from '../../src/database/delivery-client.schema.js'
import { nfeParticipants } from '../../src/database/nfe.schema.js'
import { tripDocuments } from '../../src/database/trip.schema.js'
import { RECIPIENT_PARTICIPANT_ROLE } from '../../src/trips/domain/delivery-event.constant.js'
import type { DeliveryProofFieldMode } from '../../src/trips/domain/delivery-proof-settings.policy.js'
import {
  fakeContext,
  JPEG_BYTES,
  multipartRequest,
  seedCompany,
  seedExtraDocument,
  seedTrip,
  wireRoutes,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from './trip-field-office-database.fixture.js'

export type ProofModes = {
  readonly photo: DeliveryProofFieldMode
  readonly signature: DeliveryProofFieldMode
}

export type ProofPendingScenario = {
  readonly company: Company
  readonly trip: SeededTrip
  /** Segunda nota da mesma viagem, ainda `loaded`. */
  readonly loadedDocumentId: string
  /** Terceira nota, a que o teste baixa com foto. */
  readonly withPhotoDocumentId: string
  deliver(documentId: string, options: { readonly withPhoto: boolean }): Promise<void>
}

export async function seedProofPendingScenario(
  database: TestDatabase,
  modes: ProofModes,
): Promise<ProofPendingScenario> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const extra = { separationStatus: 'loaded' as const, stopId: trip.stopId }
  const loadedDocumentId = await seedExtraDocument(database, company, trip, extra)
  const withPhotoDocumentId = await seedExtraDocument(database, company, trip, extra)
  await database.db
    .insert(companyDeliveryProofSettings)
    .values({ companyId: company.companyId, ...modes })
  const [, , , , deliverRoute] = wireRoutes(database)

  return {
    company,
    loadedDocumentId,
    trip,
    withPhotoDocumentId,
    deliver: async (documentId, options) => {
      const response = await deliverRoute!.execute({
        context: fakeContext(company),
        correlationId: `proof-pending-${documentId}`,
        pathParameters: { id: trip.tripId, documentId },
        request: multipartRequest({
          fields: { deliveredAt: '2026-09-18T09:00:00.000Z', receiverName: 'Maria' },
          ...(options.withPhoto ? { file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' } } : {}),
          idempotencyKey: `proof-pending-${documentId}`,
        }),
      })
      if (response.status !== 201) throw new Error(`DELIVER_FAILED_${response.status}`)
    },
  }
}

/** Exceção do destinatário da nota: vence a geral por inteiro (ADR-0057). */
export async function seedRecipientOverride(
  database: TestDatabase,
  scenario: ProofPendingScenario,
  input: { readonly documentId: string; readonly modes: ProofModes; readonly taxId: string },
): Promise<void> {
  const { company } = scenario
  const [document] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, input.documentId))
  if (document?.nfeDocumentId === null || document === undefined) throw new Error('NO_NFE')
  await database.db.insert(nfeParticipants).values({
    companyId: company.companyId,
    documentId: document.nfeDocumentId,
    role: RECIPIENT_PARTICIPANT_ROLE,
    taxId: input.taxId,
  })
  await database.db
    .insert(deliveryClients)
    .values({ companyId: company.companyId, taxId: input.taxId })
  await database.db
    .insert(deliveryProofSettingOverrides)
    .values({ companyId: company.companyId, taxId: input.taxId, ...input.modes })
}
