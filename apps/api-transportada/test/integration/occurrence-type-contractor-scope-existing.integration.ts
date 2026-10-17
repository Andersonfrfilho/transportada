/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.6 (RF8, ADR-0107 §5): o escopo vale para registrar, não para ler. Uma ocorrência registrada
 * com o tipo geral continua no feed, no detalhe e na linha do tempo, e aceita a correção de itens, mesmo
 * depois de o tipo virar `listed` sem a contratante da nota.
 */
import { describe, expect } from 'bun:test'

import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import { contractors } from '../../src/database/delivery-client.schema.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { correctOccurrenceItems } from '../../src/trips/application/correct-occurrence-items.use-case.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { createReadTripOccurrenceTimelineUseCase } from '../../src/trips/application/read-trip-occurrence-timeline.use-case.js'
import { saveOccurrenceType } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOccurrenceCorrectionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-correction.repository.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { findTripOccurrenceDetail } from '../../src/trips/infrastructure/trip-occurrence-detail.query.js'
import { listTripOccurrenceFeed } from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { findTripOccurrenceTimelineSources } from '../../src/trips/infrastructure/trip-occurrence-timeline.query.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

describe('o que já foi registrado fica legível e corrigível (spec 270 T2.6, RF8)', () => {
  testWithPostgres(
    'feed, detalhe, linha do tempo e correção de itens seguem depois de o tipo virar listed sem a contratante da nota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const created = await saveOccurrenceType(database.db, {
          active: true,
          allowsMultipleItems: true,
          companyId: company.companyId,
          emailTemplateKey: null,
          flow: 'document',
          name: 'Caixa violada',
          notifies: false,
          occurrenceTypeId: null,
          stage: 'separation',
        })
        const saved = await persistSeparationOccurrenceWithAttachment({
          attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
          input: {
            actorUserId: company.userId,
            companyId: company.companyId,
            documentId: trip.documentId,
            items: [],
            note: 'caixa com avaria visível',
            occurrenceTypeId: created.id,
            productCode: '',
            productCodes: [],
            redeliveryPolicy: 'unset',
            stage: TRIP_OCCURRENCE_STAGE.separation,
            tripId: trip.tripId,
            typeName: 'Caixa violada',
          },
          newObjectId: () => crypto.randomUUID(),
          now: () => new Date('2026-09-22T12:00:00.000Z'),
          storage: fakeAttachmentStorage([]),
          unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
        })
        if (saved === null) throw new Error('EXPECTED_OCCURRENCE')

        const unrelatedContractor = crypto.randomUUID()
        await database.db.insert(contractors).values({
          companyId: company.companyId,
          id: unrelatedContractor,
          taxId: '33444555000166',
        })
        await saveOccurrenceType(database.db, {
          active: true,
          allowsMultipleItems: true,
          companyId: company.companyId,
          contractorIds: [unrelatedContractor],
          contractorScope: 'listed',
          emailTemplateKey: null,
          name: 'Caixa violada',
          notifies: false,
          occurrenceTypeId: created.id,
          stage: 'separation',
        })
        const [stored] = await database.db
          .select({ scope: companyOccurrenceTypes.contractorScope })
          .from(companyOccurrenceTypes)
        expect(stored?.scope).toBe('listed')

        const page = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })
        expect(page.items.map((item) => item.id)).toEqual([saved.id])
        expect(page.items[0]?.typeName).toBe('Caixa violada')

        const detail = await findTripOccurrenceDetail(database.db, {
          companyId: company.companyId,
          occurrenceId: saved.id,
        })
        expect(detail).not.toBeNull()

        const timeline = await createReadTripOccurrenceTimelineUseCase({
          reader: { findSources: (input) => findTripOccurrenceTimelineSources(database.db, input) },
        }).execute({ context: { companyId: company.companyId }, occurrenceId: saved.id })
        expect(timeline.events.map((event) => event.kind)).toContain('occurrence.recorded')

        const corrected = await correctOccurrenceItems({
          actorUserId: company.userId,
          companyId: company.companyId,
          occurrenceId: saved.id,
          productCode: '',
          productCodes: [],
          unitOfWork: new DrizzleOccurrenceCorrectionUnitOfWork(database.db),
        })
        expect(corrected.id).toBe(saved.id)
      })
    },
    90_000,
  )
})
