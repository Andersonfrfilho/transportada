/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (Etapa 2, T8): a cobrança no recebimento contra o Postgres de verdade. O contrato com dublê
 * (`test/trip-occurrence/receiving-charge.contract.ts`) prova as decisões; aqui se prova o SQL:
 *
 * - o registro grava ocorrência, fotos por vaga, a linha `receiving_charge` e a marca do cliente numa transação;
 * - o reenvio pela mesma chave não duplica nada (os índices únicos parciais, E6);
 * - a agrupada grava `delivery_charge_documents`;
 * - os Ressarcimentos leem a linha, com as fotos e o PIX, e nunca as de outra empresa;
 * - o comprovante do PIX só aceita anexo da conversa do motorista desta ocorrência;
 * - a marca do cliente se lê e se limpa com auditoria.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  auditLogs,
  companies,
  companyOccurrenceTypes,
  contractors,
  deliveryClients,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  deliveryChargeDocuments,
  deliveryCharges,
} from '../../src/database/delivery-client.schema.js'
import {
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversations,
} from '../../src/database/occurrence-conversation.schema.js'
import { storedObjects } from '../../src/database/storage.schema.js'
import {
  companyOccurrenceTypePhotoSlots,
  tripDocuments,
  tripDrivers,
  tripOccurrenceUploads,
  tripStopOccurrencePhotos,
  tripStopOccurrences,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { DrizzleDeliveryClientReceivingChargeFlagRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-client-receiving-charge-flag.repository.js'
import { DrizzleOccurrenceChargeReportRepository } from '../../src/delivery-clients/infrastructure/drizzle-occurrence-charge-report.repository.js'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { confirmOccurrenceUpload } from '../../src/trips/application/confirm-occurrence-upload.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import type { ReportStopOccurrenceInput } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { createResolveOccurrenceUseCase } from '../../src/trips/application/resolve-occurrence.use-case.js'
import { OCCURRENCE_PHOTO_MAX_BYTES } from '../../src/trips/domain/occurrence-attachment.policy.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleOccurrenceResolutionUnitOfWork } from '../../src/trips/infrastructure/drizzle-occurrence-resolution.repository.js'
import { DrizzleOccurrenceUploadRepository } from '../../src/trips/infrastructure/drizzle-occurrence-upload.repository.js'
import { attachUploadToStopOccurrence } from '../../src/trips/infrastructure/stop-occurrence-attachment.query.js'
import { createInMemoryObjectStorageProvider } from '../fixtures/in-memory-object-storage.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-11-10T12:00:00.000Z')
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const BUCKET = 'test-bucket'
const CLIENT_TAX_ID = '33444555000166'
const CONTRACTOR_TAX_ID = '22333444000155'

type World = {
  readonly chargeTypeId: string
  readonly companyId: string
  readonly contractorId: string
  readonly deliveryClientId: string
  readonly documentIds: readonly string[]
  readonly driverId: string
  readonly stopId: string
  readonly tripId: string
  readonly userId: string
}

describe('a cobrança no recebimento vai para os acertos (spec 317, Postgres)', () => {
  testWithPostgres(
    'registro com as duas fotos: uma linha recorded, fotos, cliente marcado; reenvio não duplica',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { documents: 1 })
        const sign = await seedConfirmedUpload(database, world)
        const receipt = await seedConfirmedUpload(database, world)
        const input = occurrenceInput(database, world, {
          key: 'chave-1',
          photos: [
            { objectId: sign, slotKey: 'charge_sign' },
            { objectId: receipt, slotKey: 'payment_receipt' },
          ],
          receivingCharge: {
            amount: '45.90',
            driverPix: { key: '12345678909', type: 'cpf' },
            paidBy: 'driver',
          },
        })

        const first = await reportStopOccurrence(input)
        const second = await reportStopOccurrence(input)
        expect(second.id).toBe(first.id)

        const charges = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.companyId, world.companyId))
        expect(charges).toHaveLength(1)
        expect(charges[0]).toMatchObject({
          amount: '45.9000',
          chargeType: 'receiving_charge',
          contractorId: world.contractorId,
          deliveryClientId: world.deliveryClientId,
          groupedDocuments: false,
          origin: 'occurrence',
          proofObjectId: receipt,
          status: 'recorded',
          stopOccurrenceId: first.id,
          tripDocumentId: world.documentIds[0],
          tripId: world.tripId,
        })

        const photos = await database.db
          .select({
            objectId: tripStopOccurrencePhotos.objectId,
            slotKey: tripStopOccurrencePhotos.slotKey,
          })
          .from(tripStopOccurrencePhotos)
          .where(eq(tripStopOccurrencePhotos.stopOccurrenceId, first.id))
        expect(photos.sort((a, b) => a.slotKey.localeCompare(b.slotKey))).toEqual([
          { objectId: sign, slotKey: 'charge_sign' },
          { objectId: receipt, slotKey: 'payment_receipt' },
        ])

        const [occurrence] = await database.db
          .select({
            attachmentObjectId: tripStopOccurrences.attachmentObjectId,
            declaredAmount: tripStopOccurrences.declaredAmount,
            documentId: tripStopOccurrences.tripDocumentId,
            driverPixKey: tripStopOccurrences.driverPixKey,
            paidBy: tripStopOccurrences.paidBy,
          })
          .from(tripStopOccurrences)
          .where(eq(tripStopOccurrences.id, first.id))
        expect(occurrence).toEqual({
          attachmentObjectId: sign,
          declaredAmount: '45.9000',
          documentId: world.documentIds[0] ?? null,
          driverPixKey: '12345678909',
          paidBy: 'driver',
        })

        const flags = new DrizzleDeliveryClientReceivingChargeFlagRepository(database.db)
        const flag = await flags.read({
          companyId: world.companyId,
          deliveryClientId: world.deliveryClientId,
        })
        expect(flag?.sourceStopOccurrenceId).toBe(first.id)
        expect(flag?.flaggedAt).toEqual(expect.any(String))
      })
    },
  )

  testWithPostgres(
    'agrupada: uma linha sem nota própria e as notas em delivery_charge_documents',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { documents: 2 })
        const input = occurrenceInput(database, world, {
          key: 'chave-agrupada',
          photos: [
            { objectId: await seedConfirmedUpload(database, world), slotKey: 'charge_sign' },
            { objectId: await seedConfirmedUpload(database, world), slotKey: 'payment_receipt' },
          ],
          receivingCharge: {
            amount: '100.00',
            documents: world.documentIds.map((documentId) => ({ documentId })),
            mode: 'grouped',
            paidBy: 'company',
          },
        })

        await reportStopOccurrence(input)
        await reportStopOccurrence(input)

        const charges = await database.db
          .select({
            grouped: deliveryCharges.groupedDocuments,
            id: deliveryCharges.id,
            tripDocumentId: deliveryCharges.tripDocumentId,
          })
          .from(deliveryCharges)
          .where(eq(deliveryCharges.companyId, world.companyId))
        expect(charges).toHaveLength(1)
        expect(charges[0]).toMatchObject({ grouped: true, tripDocumentId: null })
        const linked = await database.db
          .select({ tripDocumentId: deliveryChargeDocuments.tripDocumentId })
          .from(deliveryChargeDocuments)
          .where(eq(deliveryChargeDocuments.chargeId, charges[0]?.id ?? ''))
        expect(linked.map((row) => row.tripDocumentId).sort()).toEqual(
          [...world.documentIds].sort(),
        )
      })
    },
  )

  testWithPostgres(
    'foto faltando: nada é gravado — ocorrência, linha, foto nem marca',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { documents: 1 })
        const rejected = await reportStopOccurrence(
          occurrenceInput(database, world, {
            key: 'chave-sem-foto',
            photos: [
              { objectId: await seedConfirmedUpload(database, world), slotKey: 'charge_sign' },
            ],
            receivingCharge: { amount: '10', paidBy: 'company' },
          }),
        ).catch((error: unknown) => error)

        expect((rejected as { code?: string }).code).toBe('STOP_OCCURRENCE_PHOTO_SLOT_MISSING')
        expect(await database.db.select().from(tripStopOccurrences)).toHaveLength(0)
        expect(await database.db.select().from(deliveryCharges)).toHaveLength(0)
        const [client] = await database.db
          .select({ flaggedAt: deliveryClients.receivingChargeFlaggedAt })
          .from(deliveryClients)
          .where(eq(deliveryClients.id, world.deliveryClientId))
        expect(client?.flaggedAt).toBeNull()
      })
    },
  )

  testWithPostgres(
    'os Ressarcimentos listam a cobrança com fotos e PIX, e nunca a de outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { documents: 1 })
        const otherWorld = await seedWorld(database, { documents: 1 })
        for (const target of [world, otherWorld]) {
          await reportStopOccurrence(
            occurrenceInput(database, target, {
              key: 'chave-relatorio',
              photos: [
                { objectId: await seedConfirmedUpload(database, target), slotKey: 'charge_sign' },
                {
                  objectId: await seedConfirmedUpload(database, target),
                  slotKey: 'payment_receipt',
                },
              ],
              receivingCharge: {
                amount: '12.00',
                driverPix: { key: 'motorista@exemplo.com', type: 'email' },
                paidBy: 'driver',
              },
            }),
          )
        }

        const report = new DrizzleOccurrenceChargeReportRepository(database.db)
        const page = await report.read({ companyId: world.companyId, filters: { limit: 50 } })

        expect(page.items).toHaveLength(1)
        expect(page.items[0]).toMatchObject({
          amount: '12.0000',
          chargeType: 'receiving_charge',
          receivingCharge: {
            driverPayoutSentAt: null,
            driverPixKey: 'motorista@exemplo.com',
            driverPixKeyType: 'email',
            paidBy: 'driver',
          },
          tripId: world.tripId,
        })
        expect(page.items[0]?.photos.map((photo) => [photo.slotKey, photo.label])).toEqual([
          ['charge_sign', 'Foto da placa de cobrança'],
          ['payment_receipt', 'Foto do comprovante de pagamento'],
        ])
        expect(page.totals.totalCount).toBe(1)
      })
    },
  )

  testWithPostgres(
    'o comprovante do PIX só vale do chat do motorista desta ocorrência, e conclui junto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { documents: 1 })
        const recorded = await reportStopOccurrence(
          occurrenceInput(database, world, {
            key: 'chave-pix',
            photos: [
              { objectId: await seedConfirmedUpload(database, world), slotKey: 'charge_sign' },
              { objectId: await seedConfirmedUpload(database, world), slotKey: 'payment_receipt' },
            ],
            receivingCharge: {
              amount: '30',
              driverPix: { key: '12345678909', type: 'cpf' },
              paidBy: 'driver',
            },
          }),
        )
        const inbound = await seedConversationAttachment(database, world, recorded.id, 'inbound')
        const outbound = await seedConversationAttachment(database, world, recorded.id, 'outbound')

        const useCase = createResolveOccurrenceUseCase({
          logger: { error() {}, info() {}, warn() {} },
          unitOfWork: new DrizzleOccurrenceResolutionUnitOfWork(database.db),
        })
        const context = { companyId: world.companyId, userId: world.userId } as never
        const refused = await useCase
          .execute({
            context,
            driverPayoutReceiptAttachmentId: inbound.attachmentId,
            note: 'PIX feito',
            occurrenceId: recorded.id,
            occurrenceKind: 'stop',
          })
          .catch((error: unknown) => error)
        expect((refused as { code?: string }).code).toBe('STOP_OCCURRENCE_PAYOUT_RECEIPT_NOT_FOUND')

        await useCase.execute({
          context,
          driverPayoutReceiptAttachmentId: outbound.attachmentId,
          note: 'PIX feito',
          occurrenceId: recorded.id,
          occurrenceKind: 'stop',
        })
        const [row] = await database.db
          .select({
            receipt: tripStopOccurrences.driverPayoutReceiptObjectId,
            sentAt: tripStopOccurrences.driverPayoutSentAt,
            sentBy: tripStopOccurrences.driverPayoutSentByUserId,
          })
          .from(tripStopOccurrences)
          .where(eq(tripStopOccurrences.id, recorded.id))
        expect(row?.receipt).toBe(outbound.storedObjectId)
        expect(row?.sentAt).toBeInstanceOf(Date)
        expect(row?.sentBy).toBe(world.userId)
      })
    },
  )

  testWithPostgres(
    'limpar a marca do cliente zera os dois campos e audita; de outra empresa é null',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, { documents: 1 })
        const otherWorld = await seedWorld(database, { documents: 1 })
        await reportStopOccurrence(
          occurrenceInput(database, world, {
            key: 'chave-marca',
            photos: [
              { objectId: await seedConfirmedUpload(database, world), slotKey: 'charge_sign' },
              { objectId: await seedConfirmedUpload(database, world), slotKey: 'payment_receipt' },
            ],
            receivingCharge: { amount: '5', paidBy: 'company' },
          }),
        )

        const flags = new DrizzleDeliveryClientReceivingChargeFlagRepository(database.db)
        expect(
          await flags.clear({
            actorUserId: otherWorld.userId,
            companyId: otherWorld.companyId,
            correlationId: 'corr',
            deliveryClientId: world.deliveryClientId,
          }),
        ).toBeNull()

        const cleared = await flags.clear({
          actorUserId: world.userId,
          companyId: world.companyId,
          correlationId: 'corr',
          deliveryClientId: world.deliveryClientId,
        })
        expect(cleared).toEqual({ flaggedAt: null, sourceStopOccurrenceId: null })
        await flags.clear({
          actorUserId: world.userId,
          companyId: world.companyId,
          correlationId: 'corr',
          deliveryClientId: world.deliveryClientId,
        })
        const audits = await database.db
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.companyId, world.companyId),
              eq(auditLogs.action, 'delivery-client.receiving-charge-flag.cleared'),
            ),
          )
        expect(audits).toHaveLength(1)
      })
    },
  )
})

function occurrenceInput(
  database: TestDatabase,
  world: World,
  input: {
    readonly key: string
    readonly photos: ReportStopOccurrenceInput['photos']
    readonly receivingCharge: ReportStopOccurrenceInput['receivingCharge']
  },
): ReportStopOccurrenceInput {
  const uploads = new DrizzleOccurrenceUploadRepository(database.db)
  return {
    actorUserId: world.userId,
    attachmentObjectId: null,
    attachmentUploads: {
      attachUploadToStopOccurrence: (query: Parameters<typeof attachUploadToStopOccurrence>[1]) =>
        attachUploadToStopOccurrence(database.db, query),
      findConfirmedUpload: (query: Parameters<typeof uploads.findConfirmedUpload>[0]) =>
        uploads.findConfirmedUpload(query),
    },
    companyId: world.companyId,
    description: 'Cobraram para receber',
    distanceMeters: null,
    documentId: null,
    driverId: world.driverId,
    idempotencyKey: input.key,
    occurrenceTypeId: world.chargeTypeId,
    photos: input.photos,
    receivingCharge: input.receivingCharge,
    stopId: world.stopId,
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, BUCKET),
  } as ReportStopOccurrenceInput
}

async function seedConversationAttachment(
  database: TestDatabase,
  world: World,
  occurrenceId: string,
  direction: 'inbound' | 'outbound',
): Promise<{ readonly attachmentId: string; readonly storedObjectId: string }> {
  const conversationId =
    (
      await database.db
        .select({ id: occurrenceConversations.id })
        .from(occurrenceConversations)
        .where(eq(occurrenceConversations.occurrenceId, occurrenceId))
    )[0]?.id ?? crypto.randomUUID()
  await database.db
    .insert(occurrenceConversations)
    .values({
      companyId: world.companyId,
      driverUserId: world.userId,
      id: conversationId,
      occurrenceId,
      occurrenceKind: 'stop',
      participant: 'driver',
    })
    .onConflictDoNothing()
  const messageId = crypto.randomUUID()
  await database.db.insert(occurrenceConversationMessages).values({
    bodyText: 'comprovante',
    channel: 'app',
    companyId: world.companyId,
    conversationId,
    direction,
    id: messageId,
    ...(direction === 'outbound'
      ? { authorUserId: world.userId, status: 'delivered' as const }
      : { driverUserId: world.userId }),
  })
  const storedObjectId = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: BUCKET,
    companyId: world.companyId,
    id: storedObjectId,
    mimeType: 'image/jpeg',
    objectKey: `tenants/${world.companyId}/conversation/${storedObjectId}`,
    provider: 's3',
    purpose: 'occurrence_conversation_attachment',
    sha256: '2'.repeat(64),
    sizeBytes: 8n,
    status: 'final',
  })
  const attachmentId = crypto.randomUUID()
  await database.db.insert(occurrenceConversationAttachments).values({
    companyId: world.companyId,
    contentType: 'image/jpeg',
    fileName: 'pix.jpg',
    id: attachmentId,
    messageId,
    sha256: '2'.repeat(64),
    sizeBytes: 8,
    storedObjectId,
  })
  return { attachmentId, storedObjectId }
}

/** O caminho da 179 de verdade: pedido `pending` e a confirmação que grava `stored_objects` (molde da 209). */
async function seedConfirmedUpload(database: TestDatabase, world: World): Promise<string> {
  const id = crypto.randomUUID()
  const objectKey = `tenants/${world.companyId}/trip-occurrence-uploads/${world.tripId}/${id}`
  await database.db.insert(tripOccurrenceUploads).values({
    bucket: BUCKET,
    companyId: world.companyId,
    declaredSizeBytes: BigInt(JPEG_BYTES.byteLength),
    driverId: world.driverId,
    expiresAt: new Date(NOW.getTime() + 60_000),
    id,
    mimeType: 'image/jpeg',
    objectKey,
    status: 'pending',
    tripId: world.tripId,
  })
  const storage = createNfeStorageGateway({
    finalBucket: BUCKET,
    provider: createInMemoryObjectStorageProvider({
      maxObjectSizeBytes: OCCURRENCE_PHOTO_MAX_BYTES,
    }),
    stagingBucket: BUCKET,
  })
  await storage.storeObject({
    body: JPEG_BYTES,
    bucket: BUCKET,
    contentLength: JPEG_BYTES.byteLength,
    contentType: 'image/jpeg',
    key: objectKey,
    sha256: createHash('sha256').update(JPEG_BYTES).digest('hex'),
  })
  await confirmOccurrenceUpload({
    companyId: world.companyId,
    id,
    now: NOW,
    repository: new DrizzleOccurrenceUploadRepository(database.db),
    storage,
    tripId: world.tripId,
  })
  return id
}

async function seedWorld(
  database: TestDatabase,
  input: { readonly documents: number },
): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const deliveryClientId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  const chargeTypeId = crypto.randomUUID()
  const importId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db
    .insert(fleetDrivers)
    .values({ companyId, id: driverId, membershipId, name: 'Motorista', taxId: '11111111111' })
  await database.db.insert(trips).values({ companyId, id: tripId, status: 'in_transit', vehicleId })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista',
    driverTaxId: '11111111111',
    position: 1n,
    tripId,
  })
  await database.db.insert(tripStops).values({
    addressKey: '3550308|01001000|100',
    companyId,
    id: stopId,
    label: 'Centro, 100',
    sequence: 1n,
    tripId,
  })
  await database.db
    .insert(deliveryClients)
    .values({ companyId, displayName: 'Loja Central', id: deliveryClientId, taxId: CLIENT_TAX_ID })
  await database.db
    .insert(contractors)
    .values({ companyId, displayName: 'Contratante', id: contractorId, taxId: CONTRACTOR_TAX_ID })
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId,
    flow: 'stop',
    id: chargeTypeId,
    name: 'Cobrança no recebimento',
    stage: 'delivery',
    stopKind: 'unexpected_charge',
  })
  await database.db.insert(companyOccurrenceTypePhotoSlots).values([
    {
      companyId,
      label: 'Foto da placa de cobrança',
      occurrenceTypeId: chargeTypeId,
      position: 0,
      slotKey: 'charge_sign',
    },
    {
      companyId,
      label: 'Foto do comprovante de pagamento',
      occurrenceTypeId: chargeTypeId,
      position: 1,
      slotKey: 'payment_receipt',
    },
  ])

  const xmlObjectId = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: BUCKET,
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${xmlObjectId}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: '1'.repeat(64),
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: 'correlation-317',
    id: importId,
    idempotencyKey: `import-${importId}`,
    requestFingerprint: 'fingerprint-317',
    requestedByUserId: userId,
    source: 'upload',
    status: 'completed',
  })

  const documentIds: string[] = []
  for (let index = 0; index < input.documents; index += 1) {
    const nfeDocumentId = crypto.randomUUID()
    await database.db.insert(nfeDocuments).values({
      accessKey: Array.from({ length: 44 }, () => String(Math.floor(Math.random() * 10))).join(''),
      authorizationProtocol: 'protocol-317',
      companyId,
      createdByUserId: userId,
      freightValue: '0.0000',
      id: nfeDocumentId,
      importId,
      issuedAt: new Date('2026-11-09T06:00:00.000Z'),
      model: '55',
      number: String(900001 + index),
      operationNature: 'Venda',
      operationType: '1',
      productsValue: '1000.0000',
      series: '1',
      source: 'upload',
      status: 'authorized',
      totalValue: '1000.0000',
      xmlObjectId,
      xmlSha256: '1'.repeat(64),
    })
    for (const [role, taxId] of [
      ['emitter', CONTRACTOR_TAX_ID],
      ['recipient', CLIENT_TAX_ID],
    ] as const) {
      await database.db.insert(nfeParticipants).values({
        companyId,
        documentId: nfeDocumentId,
        id: crypto.randomUUID(),
        legalName: role,
        role,
        taxId,
      })
    }
    const tripDocumentId = crypto.randomUUID()
    await database.db.insert(tripDocuments).values({
      companyId,
      id: tripDocumentId,
      nfeDocumentId,
      separationStatus: 'loaded',
      stopId,
      tripId,
    })
    documentIds.push(tripDocumentId)
  }

  return {
    chargeTypeId,
    companyId,
    contractorId,
    deliveryClientId,
    documentIds,
    driverId,
    stopId,
    tripId,
    userId,
  }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_317',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
