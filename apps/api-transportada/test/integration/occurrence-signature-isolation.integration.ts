/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.5 (CA06, RF9, regra da 209), contra Postgres real: a assinatura da ocorrência de nota
 * mora em `signature_object_id` e **só ali**. Registrar a ocorrência com a assinatura não cria
 * comprovante de entrega (`trip_delivery_proofs`), não mexe na pontualidade nem na nota do motorista —
 * que leem o comprovante —, e não vira linha de anexo de foto (que contaria no mínimo de fotos, no
 * expurgo e no demonstrativo). E o registro sem a assinatura, em tipo que a exige, volta o erro
 * estável antes de gravar qualquer coisa.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  tripDeliveryProofs,
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
} from '../../src/database/trip.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import {
  TripOccurrenceSignatureIsAttachmentError,
  TripOccurrenceSignatureRequiredError,
} from '../../src/trips/domain/trip.error.js'
import {
  listDeliveryProofs,
  saveOccurrenceType,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import {
  registerStreetOccurrence,
  seedConfirmedUpload,
} from '../fixtures/street-occurrence-registration.fixture.js'
import {
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const NOW = new Date('2026-09-18T12:00:00.000Z')

describe('a assinatura da ocorrência não vira comprovante, nota nem foto (spec 246 T2.5, CA06)', () => {
  testWithPostgres(
    'sem assinatura: erro estável e nada gravado; com assinatura: só a coluna própria muda',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const type = await saveOccurrenceType(database.db, {
          active: true,
          companyId: company.companyId,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          flow: 'document',
          name: 'Recusa total',
          notifies: false,
          occurrenceTypeId: null,
          signatureMode: 'required',
          stage: 'delivery',
        })
        const signatureId = await seedConfirmedUpload(database, { company, trip })
        const scores = new DrizzleDriverScoreRepository(database.db)
        const readScore = () =>
          scores.readPenalties({
            companyId: company.companyId,
            driverId: company.firstDriverId,
            now: NOW,
          })
        const scoreBefore = await readScore()

        const refused = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company,
          trip,
          typeId: type.id,
        }).then(
          () => undefined,
          (reason: unknown) => reason,
        )
        expect(refused).toBeInstanceOf(TripOccurrenceSignatureRequiredError)
        expect((refused as TripOccurrenceSignatureRequiredError).code).toBe(
          'TRIP_OCCURRENCE_SIGNATURE_REQUIRED',
        )
        expect(
          await database.db
            .select({ id: tripDocumentOccurrences.id })
            .from(tripDocumentOccurrences)
            .where(eq(tripDocumentOccurrences.companyId, company.companyId)),
        ).toHaveLength(0)

        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          company,
          signatureObjectId: signatureId,
          trip,
          typeId: type.id,
        })

        const [occurrence] = await database.db
          .select({
            attachmentObjectId: tripDocumentOccurrences.attachmentObjectId,
            signatureObjectId: tripDocumentOccurrences.signatureObjectId,
          })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.id, saved.id))
        expect(occurrence).toEqual({ attachmentObjectId: null, signatureObjectId: signatureId })

        // Nenhum comprovante de entrega nasce — a pontualidade e a nota leem só dele.
        expect(
          await database.db
            .select({ id: tripDeliveryProofs.id })
            .from(tripDeliveryProofs)
            .where(eq(tripDeliveryProofs.companyId, company.companyId)),
        ).toHaveLength(0)
        expect(
          await listDeliveryProofs(database.db, {
            companyId: company.companyId,
            documentId: trip.documentId,
            tripId: trip.tripId,
          }),
        ).toHaveLength(0)
        expect(await readScore()).toEqual(scoreBefore)

        // E nenhuma linha de anexo de foto referencia a assinatura nem a ocorrência.
        expect(
          await database.db
            .select({ id: tripDocumentOccurrenceAttachments.id })
            .from(tripDocumentOccurrenceAttachments)
            .where(eq(tripDocumentOccurrenceAttachments.companyId, company.companyId)),
        ).toHaveLength(0)
      })
    },
    60_000,
  )
})

describe('a assinatura repetida como anexo é recusada e não vira foto (spec 246, revisão final M1)', () => {
  testWithPostgres(
    'o mesmo upload como assinatura e como anexo: 400 estável, nenhuma ocorrência e nenhuma linha de anexo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const type = await saveOccurrenceType(database.db, {
          active: true,
          attachmentMode: 'required',
          companyId: company.companyId,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          flow: 'document',
          name: 'Recusa total',
          notifies: false,
          occurrenceTypeId: null,
          photoMinimumCount: 1,
          signatureMode: 'required',
          stage: 'delivery',
        })
        const reusedId = await seedConfirmedUpload(database, { company, trip })

        for (const attachment of [
          { attachmentObjectId: reusedId, attachmentObjectIds: undefined },
          { attachmentObjectId: null, attachmentObjectIds: [reusedId] },
        ]) {
          const refused = await registerStreetOccurrence(database, {
            company,
            signatureObjectId: reusedId,
            trip,
            typeId: type.id,
            attachmentObjectId: attachment.attachmentObjectId,
            ...(attachment.attachmentObjectIds === undefined
              ? {}
              : { attachmentObjectIds: attachment.attachmentObjectIds }),
          }).then(
            () => undefined,
            (reason: unknown) => reason,
          )
          expect(refused).toBeInstanceOf(TripOccurrenceSignatureIsAttachmentError)
          expect((refused as TripOccurrenceSignatureIsAttachmentError).status).toBe(400)
        }

        expect(
          await database.db
            .select({ id: tripDocumentOccurrences.id })
            .from(tripDocumentOccurrences)
            .where(eq(tripDocumentOccurrences.companyId, company.companyId)),
        ).toHaveLength(0)
        expect(
          await database.db
            .select({ id: tripDocumentOccurrenceAttachments.id })
            .from(tripDocumentOccurrenceAttachments)
            .where(eq(tripDocumentOccurrenceAttachments.companyId, company.companyId)),
        ).toHaveLength(0)
      })
    },
    60_000,
  )
})
