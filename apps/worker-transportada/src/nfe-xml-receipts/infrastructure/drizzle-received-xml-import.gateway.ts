/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: transforma os arquivos recebidos em uma importação `upload` na fila de sempre. Os bytes vão ao storage antes da
 * transação (objeto órfão é varrido pela reconciliação de staging); a importação, os itens, o evento do outbox e o fechamento
 * do recibo entram juntos — ou tudo, ou nada. A chave de idempotência é o próprio recibo: reentrega nunca duplica.
 */
import { createHash } from 'node:crypto'

import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { nfeImportItems, nfeImports } from '../../database/nfe.schema.js'
import { processingOutbox } from '../../database/processing.schema.js'
import { storedObjects } from '../../database/stored-object.schema.js'
import { buildNfeImportSourceObjectKey } from '../../storage/infrastructure/nfe-storage-gateway.js'
import type {
  ReceivedXmlImportGatewayPort,
  ReceiptFile,
} from '../application/nfe-xml-receipt.types.js'
import { ZIP_ENTRY_SOURCE_PREFIX } from '../../nfe-imports/infrastructure/nfe-import-archive-expander.gateway.js'
import { listSafeXmlEntries } from '../domain/zip-queue-chunking.policy.js'
import { contentTypeForReceivedFile } from '../domain/received-xml-files.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const REQUEST_EVENT_TYPE = 'transportada.nfe.import.requested'
const UNIQUE_VIOLATION_CODE = '23505'
const MAXIMUM_CAUSE_DEPTH = 3

export type ReceivedXmlStorage = {
  readonly bucket: string
  readonly put: (input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }) => Promise<{ readonly provider: string }>
}

export function createDrizzleReceivedXmlImportGateway(dependencies: {
  readonly database: Database
  readonly storage: ReceivedXmlStorage
}): ReceivedXmlImportGatewayPort {
  return {
    async createImport(input) {
      const idempotencyKey = `xml-${input.receivedVia}-${input.receiptId}`
      const importId = crypto.randomUUID()
      const staged = await Promise.all(
        input.files.map((file) => stage(dependencies.storage, input.companyId, importId, file)),
      )
      const fingerprint = createHash('sha256')
        .update([input.companyId, ...staged.map((item) => item.sha256)].join(':'))
        .digest('hex')
      const triggeredBy = input.automationJob === null ? 'user' : 'automation'
      try {
        await dependencies.database.transaction(async (transaction) => {
          for (const item of staged) {
            await transaction.insert(storedObjects).values({
              bucket: dependencies.storage.bucket,
              companyId: input.companyId,
              id: item.objectId,
              mimeType: item.contentType,
              objectKey: item.objectKey,
              provider: item.provider,
              purpose: 'import_source',
              sha256: item.sha256,
              sizeBytes: BigInt(item.size),
              status: 'staging',
            })
          }
          await transaction.insert(nfeImports).values({
            automationJob: input.automationJob,
            companyId: input.companyId,
            correlationId: input.correlationId,
            id: importId,
            idempotencyKey,
            receivedCount: BigInt(staged.length),
            receivedFrom: input.receivedFrom,
            receivedVia: input.receivedVia,
            requestFingerprint: fingerprint,
            requestedByUserId: input.requestedByUserId,
            source: 'upload',
            status: 'queued',
            triggeredBy,
          })
          await transaction.insert(nfeImportItems).values(
            staged
              .flatMap((item, index) => itemEntries(item, input.files[index], index))
              .map((entry, ordinal) => ({
                companyId: input.companyId,
                importId,
                ordinal: BigInt(ordinal + 1),
                sourceEntry: entry.sourceEntry,
                sourceName: entry.item.name,
                sourceObjectId: entry.item.objectId,
                sourceSha256: entry.item.sha256,
                status: 'pending' as const,
              })),
          )
          await transaction.insert(processingOutbox).values({
            actorUserId: input.requestedByUserId,
            aggregateId: importId,
            aggregateType: 'nfe_import',
            automationJob: input.automationJob,
            companyId: input.companyId,
            correlationId: input.correlationId,
            eventId: crypto.randomUUID(),
            eventType: REQUEST_EVENT_TYPE,
            eventVersion: 1n,
            payload: { importId },
            triggeredBy,
          })
          await transaction.execute(sql`
            update nfe_xml_receipts
            set status = 'imported', import_id = ${importId}::uuid, files_count = ${staged.length},
                updated_at = now()
            where id = ${input.receiptId}::uuid and company_id = ${input.companyId}::uuid
          `)
        })
      } catch (error: unknown) {
        // O recibo já virou importação numa tentativa anterior que caiu antes de responder: devolve a que existe.
        if (!isUniqueViolation(error)) throw error
        const existing = await findExisting(dependencies.database, input.companyId, idempotencyKey)
        if (existing === undefined) throw error
        return { importId: existing }
      }
      return { importId }
    },
  }
}

/**
 * Spec 306: um zip sadio vira um item por XML (todos apontam para o mesmo objeto do zip, `sourceEntry` = nome da entrada).
 * Antes o zip era um item só e o consumidor lia apenas o primeiro XML. Zip fora do normal segue inteiro, para o expansor
 * recusá-lo com o código exato.
 */
function itemEntries<T extends { readonly name: string }>(
  item: T,
  file: ReceiptFile | undefined,
  index: number,
): readonly { readonly item: T; readonly sourceEntry: string }[] {
  const entries =
    file !== undefined && item.name.trim().toLowerCase().endsWith('.zip')
      ? listSafeXmlEntries(file.bytes)
      : undefined
  if (entries === undefined) return [{ item, sourceEntry: index === 0 ? '/' : item.name }]
  return entries.map((entry) => ({ item, sourceEntry: `${ZIP_ENTRY_SOURCE_PREFIX}${entry.name}` }))
}

async function stage(
  storage: ReceivedXmlStorage,
  companyId: string,
  importId: string,
  file: ReceiptFile,
) {
  const objectId = crypto.randomUUID()
  const sha256 = createHash('sha256').update(file.bytes).digest('hex')
  const contentType = contentTypeForReceivedFile(file.name)
  const objectKey = buildNfeImportSourceObjectKey({ companyId, importId, objectId })
  const stored = await storage.put({
    body: file.bytes,
    bucket: storage.bucket,
    contentLength: file.bytes.byteLength,
    contentType,
    key: objectKey,
    sha256,
  })
  return {
    contentType,
    name: file.name,
    objectId,
    objectKey,
    provider: stored.provider,
    sha256,
    size: file.bytes.byteLength,
  }
}

async function findExisting(
  database: Database,
  companyId: string,
  idempotencyKey: string,
): Promise<string | undefined> {
  const rows = (await database.execute(sql`
    select id from nfe_imports
    where company_id = ${companyId}::uuid and idempotency_key = ${idempotencyKey}
  `)) as unknown as readonly { id: string }[]
  return rows[0]?.id
}

function isUniqueViolation(error: unknown, depth = 0): boolean {
  if (depth > MAXIMUM_CAUSE_DEPTH || typeof error !== 'object' || error === null) return false
  const candidate = error as {
    readonly cause?: unknown
    readonly code?: unknown
    readonly errno?: unknown
  }
  // O driver `postgres` põe o SQLSTATE em `code`; o `Bun.SQL` põe em `errno` (e `code` vira ERR_POSTGRES_SERVER_ERROR).
  if (candidate.code === UNIQUE_VIOLATION_CODE || candidate.errno === UNIQUE_VIOLATION_CODE) {
    return true
  }
  return isUniqueViolation(candidate.cause, depth + 1)
}
