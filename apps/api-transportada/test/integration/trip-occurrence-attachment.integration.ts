/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T12: as três leituras da ocorrência de galpão (painel, feed, linha do tempo) contra o
 * Postgres de verdade, sobre as **mesmas linhas** — a garantia que os dublês de T3/T9/T10 não
 * provam sozinhos é que a tabela nova, a coluna antiga (D6) e a retenção vencida (RF26) convivem no
 * mesmo banco sem um caminho enxergar o outro, e que o isolamento por empresa (RNF6) segura mesmo
 * quando duas empresas têm ocorrência com o mesmo `occurrenceId` estrutural (position, tipo).
 *
 * Cobre também as duas pendências que a fase 2 deixou em aberto (evidence.md T8): reenvio
 * idempotente — mesma chave e mesmo conteúdo converge, conteúdo diferente recusa — e a sexta foto
 * batendo no teto, os dois contra o caminho real do banco (unique + CHECK de T1), não um dublê.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { storedObjects } from '../../src/database/database.schema.js'
import { companyOccurrenceTypes, tripDocumentOccurrences } from '../../src/database/trip.schema.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { attachOccurrencePhoto } from '../../src/trips/application/attach-occurrence-photo.use-case.js'
import { withFieldReport } from '../../src/trips/application/trip-field-report.port.js'
import {
  buildOccurrenceAttachmentAppendFingerprint,
  buildOccurrenceAttachmentCreateFingerprint,
  OCCURRENCE_ATTACHMENT_APPEND_OPERATION,
  OCCURRENCE_ATTACHMENT_CREATE_OPERATION,
  sha256Hex,
} from '../../src/trips/domain/occurrence-attachment.policy.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import {
  TripFieldReportKeyReusedError,
  TripOccurrenceAttachmentLimitError,
} from '../../src/trips/domain/trip.error.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleAttachOccurrencePhotoUnitOfWork } from '../../src/trips/infrastructure/drizzle-attach-occurrence-photo.repository.js'
import { DrizzleOccurrenceAttachmentRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import type { DriverFieldReportTransactionPort } from '../../src/trips/application/driver-field-report.port.js'
import {
  findOccurrenceForAttachment,
  findTripOccurrenceById,
  listTripOccurrences,
  readOccurrenceLabels,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { readOccurrenceAttachments } from '../../src/trips/application/occurrence-attachment.service.js'
import {
  listTripOccurrenceAttachmentLocations,
  listTripOccurrenceFeed,
} from '../../src/trips/infrastructure/trip-occurrence-feed.query.js'
import { listDocumentOccurrenceRows } from '../../src/trips/infrastructure/trip-timeline-document.query.js'
import {
  fakeAttachmentStorage,
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

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const OTHER_JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04])
const THUMBNAIL_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01])

const NEVER_URL_DOWNLOADS = {
  async createDownloadUrl(input: { readonly bucket: string; readonly objectKey: string }) {
    return {
      expiresAt: '2026-09-21T12:05:00.000Z',
      url: `https://bucket.test/${input.bucket}/${input.objectKey}`,
    }
  },
}

async function seedSeparationOccurrenceType(
  database: TestDatabase,
  company: Company,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name: 'Caixa violada',
    notifies: false,
    stage: 'separation',
  })
  return id
}

/** Molde de `main.ts` (T6/T8): registro com foto + miniatura, protegido por `withFieldReport`. */
function wireOccurrenceUseCases(database: TestDatabase) {
  const driverFieldReports = new DrizzleDriverFieldReportUnitOfWork(database.db)
  const guardTransaction = {
    claim: (input: Parameters<DriverFieldReportTransactionPort['claim']>[0]) =>
      driverFieldReports.execute((transaction) => transaction.claim(input)),
    settle: (input: Parameters<DriverFieldReportTransactionPort['settle']>[0]) =>
      driverFieldReports.execute((transaction) => transaction.settle(input)),
  }
  const attachmentRepository = new DrizzleOccurrenceAttachmentRepository(database.db)
  const uploads: { objectId: string; objectKey: string }[] = []

  async function register(input: {
    readonly attachment: {
      readonly bytes: Uint8Array
      readonly mimeType: string
      readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
    }
    readonly companyId: string
    readonly documentId: string
    readonly idempotencyKey: string
    readonly occurrenceTypeId: string
    readonly tripId: string
    readonly userId: string
  }) {
    return withFieldReport({
      guard: {
        actorUserId: input.userId,
        authorship: { channel: TRIP_FIELD_CHANNELS.driverApp, onBehalfOfDriverId: null },
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: `${OCCURRENCE_ATTACHMENT_CREATE_OPERATION}:${buildOccurrenceAttachmentCreateFingerprint(
          {
            attachmentSha256: sha256Hex(input.attachment.bytes),
            note: 'caixa com avaria visível',
            occurrenceTypeId: input.occurrenceTypeId,
            productCode: '',
          },
        )}`,
        transaction: guardTransaction,
      },
      perform: async () => {
        const saved = await registerTripOccurrence({
          actorUserId: input.userId,
          attachment: input.attachment,
          companyId: input.companyId,
          documentId: input.documentId,
          notificationParameters: {
            ...(await readOccurrenceLabels(database.db, {
              companyId: input.companyId,
              documentId: input.documentId,
              tripId: input.tripId,
            })),
            documentId: input.documentId,
            occurrenceType: '',
            tripId: input.tripId,
          },
          note: 'caixa com avaria visível',
          notifier: { notify: async () => {} },
          occurrenceTypeId: input.occurrenceTypeId,
          occurredOn: '21/09/2026',
          productCode: '',
          repository: {
            findOccurrenceType: async () => ({
              active: true,
              emailBody: '',
              emailSubject: '',
              emailTemplateKey: null,
              id: input.occurrenceTypeId,
              name: 'Caixa violada',
              notifies: false,
              stage: 'separation',
            }),
            listDocumentProducts: async () => [],
            listOccurrences: (query) => listTripOccurrences(database.db, query),
            readTemplateValues: async () => ({
              contractorName: '',
              documentLabel: '',
              driverName: '',
              itemCode: '',
              itemLabel: '',
              itemQuantity: '',
              note: '',
              occurredOn: '',
              recipientName: '',
              stopLabel: '',
              totalValue: '',
            }),
            saveOccurrence: (query) =>
              persistSeparationOccurrenceWithAttachment({
                attachment: query.attachment,
                input: {
                  actorUserId: query.actorUserId,
                  companyId: query.companyId,
                  documentId: query.documentId,
                  note: query.note,
                  occurrenceTypeId: query.occurrenceTypeId,
                  productCode: query.productCode,
                  stage: query.stage,
                  tripId: query.tripId,
                  typeName: query.typeName,
                },
                newObjectId: () => crypto.randomUUID(),
                now: () => new Date(),
                storage: fakeAttachmentStorage(uploads),
                unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db),
              }),
          },
          tripId: input.tripId,
        })
        return saved
      },
      recall: async (resultId) => {
        const occurrence = await findTripOccurrenceById(database.db, {
          companyId: input.companyId,
          occurrenceId: resultId,
        })
        if (occurrence === null) return null
        const attachments = await attachmentRepository.listOccurrenceAttachments({
          companyId: input.companyId,
          occurrenceId: resultId,
        })
        return {
          ...occurrence,
          attachments: attachments.map((attachment) => ({
            id: attachment.id,
            position: attachment.position,
          })),
          email: null,
        }
      },
    })
  }

  async function attach(input: {
    readonly attachment: {
      readonly bytes: Uint8Array
      readonly mimeType: string
      readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
    }
    readonly companyId: string
    readonly idempotencyKey: string
    readonly occurrenceId: string
    readonly userId: string
  }) {
    return withFieldReport({
      guard: {
        actorUserId: input.userId,
        authorship: { channel: TRIP_FIELD_CHANNELS.driverApp, onBehalfOfDriverId: null },
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        operation: `${OCCURRENCE_ATTACHMENT_APPEND_OPERATION}:${buildOccurrenceAttachmentAppendFingerprint(
          {
            attachmentSha256: sha256Hex(input.attachment.bytes),
            occurrenceId: input.occurrenceId,
          },
        )}`,
        transaction: guardTransaction,
      },
      perform: () =>
        attachOccurrencePhoto({
          attachment: input.attachment,
          companyId: input.companyId,
          occurrenceId: input.occurrenceId,
          repository: {
            countOccurrenceAttachments: (query) =>
              attachmentRepository.countOccurrenceAttachments(query),
            findOccurrence: (query) => findOccurrenceForAttachment(database.db, query),
            newObjectId: () => crypto.randomUUID(),
            now: () => new Date(),
            storage: fakeAttachmentStorage(uploads),
            unitOfWork: new DrizzleAttachOccurrencePhotoUnitOfWork(database.db),
          },
        }),
      recall: (resultId) =>
        attachmentRepository.findAttachmentPosition({ companyId: input.companyId, id: resultId }),
    })
  }

  return { attach, attachmentRepository, register, uploads }
}

async function seedDocumentOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<string> {
  const typeId = await seedSeparationOccurrenceType(database, company)
  const useCases = wireOccurrenceUseCases(database)
  const registered = await useCases.register({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    companyId: company.companyId,
    documentId: trip.documentId,
    idempotencyKey: crypto.randomUUID(),
    occurrenceTypeId: typeId,
    tripId: trip.tripId,
    userId: company.userId,
  })
  return registered.id
}

describe('as três leituras do anexo de ocorrência contra o Postgres (spec 161 T12)', () => {
  testWithPostgres(
    'painel, feed e linha do tempo enxergam a mesma linha da tabela nova, com miniatura',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const typeId = await seedSeparationOccurrenceType(database, company)
        const useCases = wireOccurrenceUseCases(database)

        const registered = await useCases.register({
          attachment: {
            bytes: JPEG_BYTES,
            mimeType: 'image/jpeg',
            thumbnail: { bytes: THUMBNAIL_BYTES, mimeType: 'image/jpeg' },
          },
          companyId: company.companyId,
          documentId: trip.documentId,
          idempotencyKey: crypto.randomUUID(),
          occurrenceTypeId: typeId,
          tripId: trip.tripId,
          userId: company.userId,
        })

        // Painel (T9): attachments[] com downloadUrl + thumbnailUrl.
        const panelViews = await readOccurrenceAttachments({
          companyId: company.companyId,
          downloads: NEVER_URL_DOWNLOADS,
          occurrenceId: registered.id,
          repository: useCases.attachmentRepository,
        })
        expect(panelViews).toHaveLength(1)
        expect(panelViews[0]?.position).toBe(1)
        expect(panelViews[0]?.expired).toBe(false)
        expect(panelViews[0]?.downloadUrl).toBeDefined()
        expect(panelViews[0]?.thumbnailUrl).toBeDefined()

        // Feed (T10): hasAttachment real, e o detalhe no formato de RF8.
        const feedPage = await listTripOccurrenceFeed(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          order: 'desc',
        })
        const feedItem = feedPage.items.find((item) => item.id === registered.id)
        expect(feedItem?.hasAttachment).toBe(true)

        const feedRecords = await listTripOccurrenceAttachmentLocations(database.db, {
          companyId: company.companyId,
          occurrenceId: registered.id,
        })
        expect(feedRecords).toHaveLength(1)
        expect(feedRecords[0]?.thumbnail).not.toBeNull()

        // Linha do tempo (T11): contagem, nenhuma URL.
        const timelineRows = await listDocumentOccurrenceRows(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          tripId: trip.tripId,
        })
        const timelineRow = timelineRows.find((row) => row.id === registered.id)
        expect(timelineRow?.occurrence?.attachmentCount).toBe(1)
        expect(timelineRow).not.toHaveProperty('downloadUrl')
        expect(timelineRow).not.toHaveProperty('thumbnailUrl')
      })
    },
  )

  testWithPostgres(
    'ocorrência de rua (coluna antiga, D6): um item sem thumbnailUrl, nas três leituras',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const typeId = await seedSeparationOccurrenceType(database, company)

        const objectId = crypto.randomUUID()
        await database.db.insert(storedObjects).values({
          bucket: 'transportada',
          companyId: company.companyId,
          id: objectId,
          mimeType: 'image/jpeg',
          objectKey: `tenants/${company.companyId}/trip-occurrence-attachments/legacy`,
          provider: 's3',
          purpose: 'trip_occurrence_attachment',
          retentionUntil: new Date('2031-09-21T00:00:00.000Z'),
          sha256: '0'.repeat(64),
          sizeBytes: 10n,
          status: 'final',
        })
        const [occurrence] = await database.db
          .insert(tripDocumentOccurrences)
          .values({
            actorUserId: company.userId,
            attachmentObjectId: objectId,
            companyId: company.companyId,
            note: 'ocorrência de rua já registrada antes desta spec',
            occurrenceTypeId: typeId,
            productCode: '',
            stage: 'separation',
            tripDocumentId: trip.documentId,
          })
          .returning()
        const occurrenceId = occurrence?.id
        if (occurrenceId === undefined) throw new Error('occurrence not saved')

        const useCases = wireOccurrenceUseCases(database)

        const panelViews = await readOccurrenceAttachments({
          companyId: company.companyId,
          downloads: NEVER_URL_DOWNLOADS,
          occurrenceId,
          repository: useCases.attachmentRepository,
        })
        expect(panelViews).toHaveLength(1)
        expect(panelViews[0]).not.toHaveProperty('thumbnailUrl')

        const feedRecords = await listTripOccurrenceAttachmentLocations(database.db, {
          companyId: company.companyId,
          occurrenceId,
        })
        expect(feedRecords).toHaveLength(1)
        expect(feedRecords[0]?.thumbnail).toBeNull()

        const timelineRows = await listDocumentOccurrenceRows(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 20,
          tripId: trip.tripId,
        })
        const timelineRow = timelineRows.find((row) => row.id === occurrenceId)
        expect(timelineRow?.occurrence?.attachmentCount).toBe(1)
      })
    },
  )

  testWithPostgres(
    'retenção vencida (RF26): expired: true, sem nenhuma URL, mesmo sem o expurgo ter passado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceId = await seedDocumentOccurrence(database, company, trip)
        const useCases = wireOccurrenceUseCases(database)

        const rows = await useCases.attachmentRepository.listOccurrenceAttachments({
          companyId: company.companyId,
          occurrenceId,
        })
        const original = rows[0]
        if (original === undefined) throw new Error('attachment not saved')
        await database.db
          .update(storedObjects)
          .set({ retentionUntil: new Date('2020-01-01T00:00:00.000Z') })
          .where(eq(storedObjects.objectKey, original.original.objectKey))

        const panelViews = await readOccurrenceAttachments({
          companyId: company.companyId,
          downloads: NEVER_URL_DOWNLOADS,
          occurrenceId,
          repository: useCases.attachmentRepository,
        })
        expect(panelViews).toHaveLength(1)
        expect(panelViews[0]?.expired).toBe(true)
        expect(panelViews[0]).not.toHaveProperty('downloadUrl')
        expect(panelViews[0]).not.toHaveProperty('thumbnailUrl')
      })
    },
  )

  testWithPostgres(
    'isolamento por empresa: a leitura de anexo nunca alcança ocorrência de outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyA = await seedCompany(database)
        const tripA = await seedTrip(database, companyA, 'in_transit')
        const occurrenceId = await seedDocumentOccurrence(database, companyA, tripA)

        const companyB = await seedCompany(database)
        const useCases = wireOccurrenceUseCases(database)

        const crossCompanyViews = await readOccurrenceAttachments({
          companyId: companyB.companyId,
          downloads: NEVER_URL_DOWNLOADS,
          occurrenceId,
          repository: useCases.attachmentRepository,
        })
        expect(crossCompanyViews).toEqual([])

        const crossCompanyFeedRecords = await listTripOccurrenceAttachmentLocations(database.db, {
          companyId: companyB.companyId,
          occurrenceId,
        })
        expect(crossCompanyFeedRecords).toEqual([])
      })
    },
  )

  testWithPostgres(
    'reenvio idempotente do registro: mesma chave e mesmo conteúdo converge, conteúdo diferente recusa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const typeId = await seedSeparationOccurrenceType(database, company)
        const useCases = wireOccurrenceUseCases(database)
        const idempotencyKey = crypto.randomUUID()

        const first = await useCases.register({
          attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
          companyId: company.companyId,
          documentId: trip.documentId,
          idempotencyKey,
          occurrenceTypeId: typeId,
          tripId: trip.tripId,
          userId: company.userId,
        })

        const second = await useCases.register({
          attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
          companyId: company.companyId,
          documentId: trip.documentId,
          idempotencyKey,
          occurrenceTypeId: typeId,
          tripId: trip.tripId,
          userId: company.userId,
        })
        expect(second.id).toBe(first.id)

        const rows = await useCases.attachmentRepository.listOccurrenceAttachments({
          companyId: company.companyId,
          occurrenceId: first.id,
        })
        expect(rows).toHaveLength(1)

        await expect(
          useCases.register({
            attachment: { bytes: OTHER_JPEG_BYTES, mimeType: 'image/jpeg' },
            companyId: company.companyId,
            documentId: trip.documentId,
            idempotencyKey,
            occurrenceTypeId: typeId,
            tripId: trip.tripId,
            userId: company.userId,
          }),
        ).rejects.toBeInstanceOf(TripFieldReportKeyReusedError)
      })
    },
  )

  testWithPostgres(
    'a sexta foto bate no teto pelo caminho real do banco (unique + CHECK de position, T1)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const occurrenceId = await seedDocumentOccurrence(database, company, trip)
        const useCases = wireOccurrenceUseCases(database)

        for (let index = 0; index < 4; index += 1) {
          await useCases.attach({
            attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
            companyId: company.companyId,
            idempotencyKey: crypto.randomUUID(),
            occurrenceId,
            userId: company.userId,
          })
        }

        const count = await useCases.attachmentRepository.countOccurrenceAttachments({
          companyId: company.companyId,
          occurrenceId,
        })
        expect(count).toBe(5)

        await expect(
          useCases.attach({
            attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
            companyId: company.companyId,
            idempotencyKey: crypto.randomUUID(),
            occurrenceId,
            userId: company.userId,
          }),
        ).rejects.toBeInstanceOf(TripOccurrenceAttachmentLimitError)
      })
    },
  )
})
