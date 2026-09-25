/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10), contra Postgres e o armazenamento S3 de verdade:
 * - o operador pede a URL, sobe o PDF pela URL assinada e envia ao motorista; a mensagem nasce com
 *   o anexo, o objeto vira `stored_objects` com o sha256 dos bytes e o pedido fica `attached`;
 * - o motorista responde com foto pelo mesmo caminho e lê as duas com URL temporária que baixa os
 *   mesmos bytes;
 * - bytes que não são do tipo declarado recusam com 422 e desfazem a mensagem inteira;
 * - o pedido de outra pessoa, de outra empresa ou já usado não liga (422), e a chave do objeto não
 *   leva id interno.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import {
  createObjectStorageProvider,
  type ObjectStorageProvider,
} from '@adatechnology/object-storage-provider'
import { and, eq } from 'drizzle-orm'

import {
  occurrenceConversationAttachments,
  occurrenceConversationMessages,
  occurrenceConversationUploads,
  storedObjects,
} from '../../src/database/database.schema.js'
import {
  createListMyOccurrenceConversationUseCase,
  createReplyMyOccurrenceConversationUseCase,
  createRequestMyConversationUploadUseCase,
  createSendDriverAppMessageUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createRequestOccurrenceConversationUploadUseCase } from '../../src/occurrence-conversation/application/occurrence-conversation-upload.use-case.js'
import {
  createDrizzleConversationUploadRepository,
  findOccurrenceConversationKind,
} from '../../src/occurrence-conversation/infrastructure/drizzle-conversation-attachment.repository.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import {
  createOccurrenceMailUseCase,
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const endpoint = process.env.OBJECT_STORAGE_ENDPOINT ?? process.env.STORAGE_ENDPOINT
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET
const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY ?? process.env.STORAGE_ACCESS_KEY
const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_KEY ?? process.env.STORAGE_SECRET_KEY
const region = process.env.OBJECT_STORAGE_REGION ?? process.env.STORAGE_REGION ?? 'us-east-1'
const hasInfrastructure =
  databaseUrl !== undefined &&
  [endpoint, bucket, accessKeyId, secretAccessKey].every(
    (value) => value !== undefined && value.trim() !== '',
  )
const testWithInfrastructure = hasInfrastructure ? test : test.skip
const BUCKET = bucket ?? ''

const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n')
/** Um JPEG mínimo de verdade (assinatura `FF D8 FF`). */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])

/**
 * ⚠️ O `@adatechnology/object-storage-provider@0.3.0` assina a URL de PUT com o `x-amz-checksum-crc32`
 * do corpo **vazio** (padrão do SDK 3.1091 sem `requestChecksumCalculation: 'WHEN_REQUIRED'`), e o
 * storage que confere o checksum recusa o upload real com `BadDigest` — medido no S3 local desta
 * sessão (SeaweedFS, 25/09/2026). Não é deste anexo: o upload da foto da 179 usa o mesmo método. A
 * correção é do pacote ou do ambiente (decisão registrada em `evidence.md` da 183, T702a); aqui o
 * processo de teste liga a variável padrão do SDK para exercitar o fluxo, sem mascarar o achado.
 */
process.env.AWS_REQUEST_CHECKSUM_CALCULATION ??= 'WHEN_REQUIRED'

function createProvider(): ObjectStorageProvider {
  return createObjectStorageProvider({
    accessKeyId: accessKeyId ?? '',
    endpoint: new URL(endpoint ?? ''),
    forcePathStyle: true,
    healthCheckBucket: BUCKET,
    maxObjectSizeBytes: 25 * 1024 * 1024,
    region,
    secretAccessKey: secretAccessKey ?? '',
  })
}

async function put(url: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const response = await fetch(url, {
    body: bytes,
    headers: { 'content-length': String(bytes.byteLength), 'content-type': contentType },
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(`UPLOAD_FAILED_${String(response.status)} ${await response.text()}`)
  }
}

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}

function setup(database: TestDatabase) {
  const storage = createNfeStorageGateway({
    finalBucket: BUCKET,
    provider: createProvider(),
    stagingBucket: BUCKET,
  })
  const clock = () => new Date()
  const repository = createDrizzleConversationUploadRepository(database.db)
  const unitOfWork = createDrizzleDriverConversationUnitOfWork(database.db)
  const fingerprintService = {
    create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
      fields.map((field) => new TextDecoder().decode(field)).join('|'),
  }
  return {
    list: createListMyOccurrenceConversationUseCase({ clock, storage, unitOfWork }),
    operatorUpload: createRequestOccurrenceConversationUploadUseCase({
      bucket: BUCKET,
      clock,
      newId: () => crypto.randomUUID(),
      occurrences: { findKind: (input) => findOccurrenceConversationKind(database.db, input) },
      repository,
      storage,
    }),
    driverUpload: createRequestMyConversationUploadUseCase({
      bucket: BUCKET,
      clock,
      newId: () => crypto.randomUUID(),
      repository,
      storage,
      unitOfWork,
    }),
    reply: createReplyMyOccurrenceConversationUseCase({
      clock,
      fingerprintService,
      storage,
      unitOfWork,
    }),
    send: createSendDriverAppMessageUseCase({
      clock,
      fingerprintService,
      notifier: { notify: async () => undefined },
      storage,
      unitOfWork,
    }),
  }
}

describe('o anexo da conversa contra Postgres e S3 (spec 183 T702a)', () => {
  testWithInfrastructure(
    'operador e motorista trocam arquivo; bytes errados desfazem; pedido alheio não liga',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const other = await seedCompany(database)
        const { companyId, firstDriverId, userId: operatorId } = seeded.company
        const driverUserId = await linkDriverMembership(database, seeded.company, firstDriverId)
        const flow = setup(database)
        const declaredPdf = {
          contentType: 'application/pdf',
          fileName: 'comprovante de descarga.pdf',
          sizeBytes: PDF.byteLength,
        }

        /** 1. O operador pede, sobe e envia ao motorista só o anexo. */
        const upload = await flow.operatorUpload.request({
          ...declaredPdf,
          actorUserId: operatorId,
          channel: 'app',
          companyId,
          occurrenceId: seeded.occurrenceId,
          participant: 'driver',
        })
        expect(upload.uploadUrl).not.toContain(companyId)
        expect(upload.uploadUrl).not.toContain(seeded.occurrenceId)
        expect(upload.uploadUrl).not.toContain(upload.uploadId)
        await put(upload.uploadUrl, PDF, 'application/pdf')

        const sent = await flow.send.send({
          actorUserId: operatorId,
          attachmentIds: [upload.uploadId],
          bodyText: '',
          companyId,
          idempotencyKey: 'attachment-integration-01',
          occurrenceId: seeded.occurrenceId,
        })
        /** O reenvio da mesma chave devolve o mesmo resultado sem ligar de novo. */
        expect(
          await flow.send.send({
            actorUserId: operatorId,
            attachmentIds: [upload.uploadId],
            bodyText: '',
            companyId,
            idempotencyKey: 'attachment-integration-01',
            occurrenceId: seeded.occurrenceId,
          }),
        ).toEqual(sent)

        const [stored] = await database.db
          .select({
            mimeType: storedObjects.mimeType,
            purpose: storedObjects.purpose,
            sha256: storedObjects.sha256,
            sizeBytes: storedObjects.sizeBytes,
          })
          .from(storedObjects)
          .where(and(eq(storedObjects.companyId, companyId), eq(storedObjects.id, upload.uploadId)))
        expect(stored).toEqual({
          mimeType: 'application/pdf',
          purpose: 'occurrence_conversation_attachment',
          sha256: createHash('sha256').update(PDF).digest('hex'),
          sizeBytes: BigInt(PDF.byteLength),
        })
        const attachments = await database.db
          .select({
            fileName: occurrenceConversationAttachments.fileName,
            messageId: occurrenceConversationAttachments.messageId,
          })
          .from(occurrenceConversationAttachments)
          .where(eq(occurrenceConversationAttachments.companyId, companyId))
        expect(attachments).toEqual([
          { fileName: 'comprovante de descarga.pdf', messageId: sent.conversationMessageId },
        ])
        const [uploadRow] = await database.db
          .select({ status: occurrenceConversationUploads.status })
          .from(occurrenceConversationUploads)
          .where(eq(occurrenceConversationUploads.id, upload.uploadId))
        expect(uploadRow).toEqual({ status: 'attached' })

        /** 2. O motorista responde com foto e lê as duas, com URL que baixa os mesmos bytes. */
        const mine = {
          companyId,
          driverId: firstDriverId,
          driverUserId,
          occurrenceId: seeded.occurrenceId,
        }
        const photo = await flow.driverUpload.request({
          ...mine,
          contentType: 'image/jpeg',
          fileName: 'canhoto.jpg',
          sizeBytes: JPEG.byteLength,
        })
        await put(photo.uploadUrl, JPEG, 'image/jpeg')
        await flow.reply.reply({
          ...mine,
          attachmentIds: [photo.uploadId],
          bodyText: 'Canhoto rasgado.',
          idempotencyKey: 'attachment-integration-02',
        })

        const read = await flow.list.list(mine)
        expect(
          read.map((message) => ({
            attachments: message.attachments.map(({ contentType, fileName, sizeBytes }) => ({
              contentType,
              fileName,
              sizeBytes,
            })),
            bodyText: message.bodyText,
            direction: message.direction,
          })),
        ).toEqual([
          {
            attachments: [
              {
                contentType: 'application/pdf',
                fileName: 'comprovante de descarga.pdf',
                sizeBytes: PDF.byteLength,
              },
            ],
            bodyText: '',
            direction: 'outbound',
          },
          {
            attachments: [
              { contentType: 'image/jpeg', fileName: 'canhoto.jpg', sizeBytes: JPEG.byteLength },
            ],
            bodyText: 'Canhoto rasgado.',
            direction: 'inbound',
          },
        ])
        const download = await fetch(read[0]?.attachments[0]?.url ?? '')
        expect(new Uint8Array(await download.arrayBuffer())).toEqual(PDF)

        /** 3. Declarou PDF e subiu JPEG: 422 e nada fica — nem mensagem, nem anexo. */
        const lying = await flow.operatorUpload.request({
          ...declaredPdf,
          actorUserId: operatorId,
          channel: 'app',
          companyId,
          occurrenceId: seeded.occurrenceId,
          participant: 'driver',
        })
        /** Mesmo tamanho do declarado (o `content-length` é assinado); os bytes são de JPEG. */
        const disguised = new Uint8Array(PDF.byteLength)
        disguised.set(JPEG)
        await put(lying.uploadUrl, disguised, 'application/pdf')
        const messagesBefore = await database.db
          .select({ id: occurrenceConversationMessages.id })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.companyId, companyId))
        expect(
          await failure(() =>
            flow.send.send({
              actorUserId: operatorId,
              attachmentIds: [lying.uploadId],
              bodyText: 'Segue.',
              companyId,
              idempotencyKey: 'attachment-integration-03',
              occurrenceId: seeded.occurrenceId,
            }),
          ),
        ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_ATTACHMENT_REJECTED', status: 422 })
        const messagesAfter = await database.db
          .select({ id: occurrenceConversationMessages.id })
          .from(occurrenceConversationMessages)
          .where(eq(occurrenceConversationMessages.companyId, companyId))
        expect(messagesAfter).toHaveLength(messagesBefore.length)
        const [lyingRow] = await database.db
          .select({ status: occurrenceConversationUploads.status })
          .from(occurrenceConversationUploads)
          .where(eq(occurrenceConversationUploads.id, lying.uploadId))
        expect(lyingRow).toEqual({ status: 'pending' })

        /**
         * 4. O pedido é de quem pediu, na empresa dele: outra empresa, o motorista usando o pedido do
         * operador e o pedido já ligado dão o mesmo 422.
         */
        const foreign = await failure(() =>
          flow.send.send({
            actorUserId: other.userId,
            attachmentIds: [lying.uploadId],
            bodyText: 'x',
            companyId: other.companyId,
            idempotencyKey: 'attachment-integration-04',
            occurrenceId: seeded.occurrenceId,
          }),
        )
        expect(foreign).toMatchObject({ status: 404 })
        const stolen = await failure(() =>
          flow.reply.reply({
            ...mine,
            attachmentIds: [lying.uploadId],
            bodyText: 'x',
            idempotencyKey: 'attachment-integration-05',
          }),
        )
        expect(stolen).toMatchObject({
          code: 'OCCURRENCE_CONVERSATION_UPLOAD_INVALID',
          status: 422,
        })
        const reused = await failure(() =>
          flow.send.send({
            actorUserId: operatorId,
            attachmentIds: [upload.uploadId],
            bodyText: 'de novo',
            companyId,
            idempotencyKey: 'attachment-integration-06',
            occurrenceId: seeded.occurrenceId,
          }),
        )
        expect(reused).toMatchObject({
          code: 'OCCURRENCE_CONVERSATION_UPLOAD_INVALID',
          status: 422,
        })

        /** 5. Outra empresa nem pede upload para esta ocorrência. */
        expect(
          await failure(() =>
            flow.operatorUpload.request({
              ...declaredPdf,
              actorUserId: other.userId,
              channel: 'app',
              companyId: other.companyId,
              occurrenceId: seeded.occurrenceId,
              participant: 'driver',
            }),
          ),
        ).toMatchObject({ status: 404 })
      })
    },
    120_000,
  )

  testWithInfrastructure(
    'T702e: o operador sobe pelo canal e-mail e o arquivo liga à mensagem da conversa do e-mail',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, userId: operatorId } = seeded.company
        const flow = setup(database)
        const storage = createNfeStorageGateway({
          finalBucket: BUCKET,
          provider: createProvider(),
          stagingBucket: BUCKET,
        })

        const upload = await flow.operatorUpload.request({
          actorUserId: operatorId,
          channel: 'email',
          companyId,
          contentType: 'application/pdf',
          fileName: 'nota de devolução.pdf',
          occurrenceId: seeded.occurrenceId,
          participant: 'contractor',
          sizeBytes: PDF.byteLength,
        })
        await put(upload.uploadUrl, PDF, 'application/pdf')

        const sent = await createOccurrenceMailUseCase(database, storage).send({
          actorUserId: operatorId,
          attachmentIds: [upload.uploadId],
          bodyText: 'Segue a nota de devolução.',
          companyId,
          contactIds: seeded.contactIds.slice(0, 1),
          correlationId: 'correlation-mail-attachment',
          idempotencyKey: 'attachment-integration-mail-01',
          occurrenceId: seeded.occurrenceId,
          subject: 'Ocorrência',
        })

        const [linked] = await database.db
          .select({
            fileName: occurrenceConversationAttachments.fileName,
            mailMessageId: occurrenceConversationMessages.mailMessageId,
          })
          .from(occurrenceConversationAttachments)
          .innerJoin(
            occurrenceConversationMessages,
            eq(occurrenceConversationMessages.id, occurrenceConversationAttachments.messageId),
          )
          .where(eq(occurrenceConversationAttachments.companyId, companyId))
        expect(linked).toEqual({
          fileName: 'nota de devolução.pdf',
          mailMessageId: sent.mailMessageId,
        })

        /** O pedido do e-mail não serve ao portal: o alvo inclui o canal. */
        const portalUpload = await flow.operatorUpload.request({
          actorUserId: operatorId,
          channel: 'email',
          companyId,
          contentType: 'application/pdf',
          fileName: 'b.pdf',
          occurrenceId: seeded.occurrenceId,
          participant: 'contractor',
          sizeBytes: PDF.byteLength,
        })
        const [row] = await database.db
          .select({ channel: occurrenceConversationUploads.channel })
          .from(occurrenceConversationUploads)
          .where(eq(occurrenceConversationUploads.id, portalUpload.uploadId))
        expect(row).toEqual({ channel: 'email' })
      })
    },
    120_000,
  )

  testWithInfrastructure(
    'T705: o áudio que o motorista grava no app chega como anexo, com o sha256 dos bytes',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { companyId, firstDriverId } = seeded.company
        const driverUserId = await linkDriverMembership(database, seeded.company, firstDriverId)
        const flow = setup(database)
        /** O cabeçalho EBML do WEBM/Opus que o `MediaRecorder` do Chrome grava. */
        const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42])
        const mine = {
          companyId,
          driverId: firstDriverId,
          driverUserId,
          occurrenceId: seeded.occurrenceId,
        }

        const upload = await flow.driverUpload.request({
          ...mine,
          contentType: 'audio/webm',
          fileName: 'audio-20260925-180405.webm',
          sizeBytes: WEBM.byteLength,
        })
        await put(upload.uploadUrl, WEBM, 'audio/webm')
        await flow.reply.reply({
          ...mine,
          attachmentIds: [upload.uploadId],
          bodyText: '',
          idempotencyKey: 'attachment-integration-audio-01',
        })

        const [row] = await database.db
          .select({
            contentType: occurrenceConversationAttachments.contentType,
            sha256: occurrenceConversationAttachments.sha256,
            sizeBytes: occurrenceConversationAttachments.sizeBytes,
          })
          .from(occurrenceConversationAttachments)
          .where(eq(occurrenceConversationAttachments.companyId, companyId))
        expect(row).toEqual({
          contentType: 'audio/webm',
          sha256: createHash('sha256').update(WEBM).digest('hex'),
          sizeBytes: WEBM.byteLength,
        })
        const read = await flow.list.list(mine)
        const audio = read.at(-1)?.attachments[0]
        expect(audio?.contentType).toBe('audio/webm')
        const download = await fetch(audio?.url ?? '')
        expect(new Uint8Array(await download.arrayBuffer())).toEqual(WEBM)
      })
    },
    120_000,
  )
})
