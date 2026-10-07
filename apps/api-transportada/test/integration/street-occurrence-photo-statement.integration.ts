/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.6 (CA09, RF14), contra Postgres real: as duas leituras que só conhecem
 * `trip_document_occurrence_attachments` — o demonstrativo de ocorrências ao cliente e a resposta da
 * correção — passam a mostrar a foto da ocorrência de **rua** registrada pelo motorista, porque a
 * escrita dupla (T1d.5) grava a linha. A assinatura, na coluna `signature_object_id`, **não** aparece
 * como foto em nenhuma das duas.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  contractors,
  deliveryCharges,
  deliveryClients,
} from '../../src/database/database.schema.js'
import { tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import { createExtraChargeBatchesUseCase } from '../../src/delivery-clients/application/extra-charge-batches.use-case.js'
import { DrizzleDeliveryChargeRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { DrizzleExtraChargeBatchRepository } from '../../src/delivery-clients/infrastructure/drizzle-extra-charge-batch.repository.js'
import { DrizzleOccurrenceStatementRepository } from '../../src/delivery-clients/infrastructure/drizzle-occurrence-statement.repository.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { readOccurrenceView } from '../../src/trips/infrastructure/drizzle-occurrence-correction.repository.js'
import { seedPhotoObject } from '../fixtures/street-occurrence-attachment.fixture.js'
import { registerStreetOccurrenceWithPhoto } from '../fixtures/street-occurrence-registration.fixture.js'
import {
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

/** Uma cobrança da ocorrência, fechada num lote pelo caminho real — é o que o demonstrativo lista. */
async function closeBatchWithCharge(
  database: TestDatabase,
  input: { readonly company: Company; readonly occurrenceId: string; readonly trip: SeededTrip },
): Promise<string> {
  const { companyId } = input.company
  const contractorId = crypto.randomUUID()
  const deliveryClientId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId, displayName: 'Spani', id: contractorId, taxId: '30290856000160' })
  await database.db
    .insert(deliveryClients)
    .values({ companyId, displayName: 'Loja', id: deliveryClientId, taxId: '98765432000109' })
  await database.db.insert(deliveryCharges).values({
    amount: '135.0500',
    chargeType: 'returned_goods',
    chargedOn: '2026-09-10',
    companyId,
    contractorId,
    deliveryClientId,
    occurrenceId: input.occurrenceId,
    origin: 'occurrence',
    status: 'recorded',
    tripDocumentId: input.trip.documentId,
  })
  const batch = await createExtraChargeBatchesUseCase({
    batches: new DrizzleExtraChargeBatchRepository(database.db),
    charges: new DrizzleDeliveryChargeRepository(database.db),
    createToken: () => 'token-opaco-de-trinta-e-dois-bytes-ou-mais',
  }).close({
    context: { companyId, userId: input.company.userId } as unknown as CompanyContext,
    contractorId,
    periodEnd: '2026-09-30',
    periodStart: '2026-09-01',
  })
  return batch.id
}

describe('o demonstrativo e a correção mostram a foto de rua, nunca a assinatura (spec 246 T1d.6)', () => {
  testWithPostgres(
    'uma foto no demonstrativo e na correção, com a assinatura gravada ao lado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const registered = await registerStreetOccurrenceWithPhoto(database, { company, trip })
        const signatureObjectId = await seedPhotoObject(database, {
          company,
          purpose: 'trip_occurrence_attachment',
        })
        await database.db
          .update(tripDocumentOccurrences)
          .set({ signatureObjectId })
          .where(eq(tripDocumentOccurrences.id, registered.occurrenceId))

        const batchId = await closeBatchWithCharge(database, {
          company,
          occurrenceId: registered.occurrenceId,
          trip,
        })
        const [charge] = await new DrizzleOccurrenceStatementRepository(database.db).listChargeRows(
          {
            batchId,
            companyId: company.companyId,
          },
        )
        expect(charge?.photoCount).toBe(1)
        expect(charge?.photo?.objectKey).toBe(registered.objectKey)

        const corrected = await readOccurrenceView(database.db, {
          companyId: company.companyId,
          occurrenceId: registered.occurrenceId,
        })
        expect(corrected.attachments).toHaveLength(1)
        expect(corrected.attachments[0]?.position).toBe(1)
        expect(corrected.attachments[0]?.id).not.toBe(registered.occurrenceId)
      })
    },
  )
})
