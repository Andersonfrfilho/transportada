/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4: o que a suíte de integração de escrita por assunto repete — a resposta e o pedido de
 * upload novos montados sobre o Postgres com o dublê de storage em memória, as rotas antigas ao lado
 * (para provar que as duas dividem a idempotência) e o PUT simulado pela URL assinada.
 */
import { createHash } from 'node:crypto'

import type { ObjectStorageProvider } from '@adatechnology/object-storage-provider'

import {
  createListMyOccurrenceConversationUseCase,
  createReplyMyOccurrenceConversationUseCase,
  createRequestMyConversationUploadUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createListMySubjectMessagesUseCase } from '../../src/occurrence-conversation/application/list-my-subject-messages.use-case.js'
import { createReplyMySubjectConversationUseCase } from '../../src/occurrence-conversation/application/reply-my-subject-conversation.use-case.js'
import { createRequestMySubjectUploadUseCase } from '../../src/occurrence-conversation/application/request-my-subject-upload.use-case.js'
import { createDrizzleConversationUploadRepository } from '../../src/occurrence-conversation/infrastructure/drizzle-conversation-attachment.repository.js'
import { createDrizzleDriverConversationUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation.repository.js'
import { createDrizzleDriverSubjectWriteUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-subject-write.repository.js'
import { createDrizzleDriverSubjectUnitOfWork } from '../../src/occurrence-conversation/infrastructure/drizzle-driver-conversation-subject.repository.js'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { createInMemoryObjectStorageProvider } from './in-memory-object-storage.fixture.js'
import { createSubjectHarness } from './driver-subject-conversation-database.fixture.js'
import type { TestDatabase } from './trip-field-office-database.fixture.js'

const BUCKET = 'transportada-test-conversation'
const MAX_OBJECT_BYTES = 25 * 1024 * 1024

/** Um JPEG mínimo de verdade (assinatura `FF D8 FF`). */
export const WRITE_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1,
])

/** A URL assinada do dublê é `https://object-storage.test/<bucket>/<chave>?…`. */
function locateSignedUrl(url: string): { readonly bucket: string; readonly key: string } {
  const [bucket = '', ...key] = decodeURIComponent(new URL(url).pathname).slice(1).split('/')
  return { bucket, key: key.join('/') }
}

export async function putThroughSignedUrl(
  provider: ObjectStorageProvider,
  url: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const location = locateSignedUrl(url)
  await provider.delete(location)
  await provider.put({
    ...location,
    body: bytes,
    contentLength: bytes.byteLength,
    contentType,
    mode: 'create-only',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
}

export async function downloadThroughSignedUrl(
  provider: ObjectStorageProvider,
  url: string,
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(await provider.get(locateSignedUrl(url))).arrayBuffer())
}

export function createWriteHarness(
  database: TestDatabase['db'],
  clock: () => Date = () => new Date(),
) {
  const provider = createInMemoryObjectStorageProvider({ maxObjectSizeBytes: MAX_OBJECT_BYTES })
  const storage = createNfeStorageGateway({
    finalBucket: BUCKET,
    provider,
    stagingBucket: BUCKET,
  })
  const fingerprintService = {
    create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
      fields.map((field) => new TextDecoder().decode(field)).join('|'),
  }
  const repository = createDrizzleConversationUploadRepository(database)
  const oldUnitOfWork = createDrizzleDriverConversationUnitOfWork(database)
  return {
    ...createSubjectHarness(database, clock),
    messagesWithFiles: createListMySubjectMessagesUseCase({
      clock,
      storage,
      unitOfWork: createDrizzleDriverSubjectUnitOfWork(database),
    }),
    oldList: createListMyOccurrenceConversationUseCase({
      clock,
      storage,
      unitOfWork: oldUnitOfWork,
    }),
    oldReply: createReplyMyOccurrenceConversationUseCase({
      clock,
      fingerprintService,
      storage,
      unitOfWork: oldUnitOfWork,
    }),
    oldUpload: createRequestMyConversationUploadUseCase({
      bucket: BUCKET,
      clock,
      newId: () => crypto.randomUUID(),
      repository,
      storage,
      unitOfWork: oldUnitOfWork,
    }),
    provider,
    reply: createReplyMySubjectConversationUseCase({
      clock,
      fingerprintService,
      storage,
      unitOfWork: createDrizzleDriverSubjectWriteUnitOfWork(database),
    }),
    storage,
    upload: createRequestMySubjectUploadUseCase({
      bucket: BUCKET,
      clock,
      newId: () => crypto.randomUUID(),
      repository,
      storage,
      unitOfWork: createDrizzleDriverSubjectUnitOfWork(database),
    }),
  }
}
