/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: a prévia já lida, como o worker a deixa, para a integração das ações do operador.
 * Dados inventados; o estado de cada item é escrito direto, sem rodar a política.
 */
import { eq } from 'drizzle-orm'

import {
  cargoPreviewDocumentLinks,
  cargoPreviewItems,
  cargoPreviews,
  contractorReceivingProfiles,
} from '../../src/database/database.schema.js'
import type { CargoPreviewObjectStoragePort } from '../../src/cargo-receiving/application/cargo-preview.port.js'
import { COMPANY_CONTEXT } from './freight-region-http.fixture.js'
import type { TestDatabase } from './cargo-arrival-database.fixture.js'

export const PREVIEW_COLUMN_MAP = { routeName: 'RouteName', value: 'VALOR', weightKg: 'PESO TOTAL' }

export async function enablePreviewProfile(
  database: TestDatabase,
  contractorId: string,
): Promise<void> {
  await database.db
    .update(contractorReceivingProfiles)
    .set({ previewColumnMap: PREVIEW_COLUMN_MAP, previewEnabled: true })
    .where(eq(contractorReceivingProfiles.contractorId, contractorId))
}

export async function seedReadyPreview(
  database: TestDatabase,
  input: { readonly companyId?: string; readonly contractorId: string; readonly label: string },
): Promise<string> {
  const id = crypto.randomUUID()
  const sha = Bun.hash(input.label).toString(16).padStart(64, '0').slice(0, 64)
  await database.db.insert(cargoPreviews).values({
    companyId: input.companyId ?? COMPANY_CONTEXT.companyId,
    contractorId: input.contractorId,
    fileName: `${input.label}.xlsm`,
    fileObjectId: crypto.randomUUID(),
    fileSha256: sha,
    fileSizeBytes: 100,
    id,
    idempotencyKey: `seeded-preview-${input.label}-key`,
    plannedDate: '2026-10-05',
    receivedAt: new Date('2026-10-02T17:00:00.000Z'),
    requestFingerprint: sha,
    rowCount: 0,
    source: 'upload',
    status: 'ready',
    uploadedByUserId: COMPANY_CONTEXT.userId,
  })
  return id
}

type SeedItem = {
  readonly documentId?: string
  readonly previewId: string
  readonly recipientCode?: string
  readonly rowNumber: number
  readonly state: 'ambiguous' | 'awaiting_xml' | 'matched' | 'suggested'
  readonly suggestedDocumentId?: string
}

/** O item, e o vínculo da nota quando ele já nasce `matched` pelo sistema. */
export async function seedPreviewItem(database: TestDatabase, item: SeedItem): Promise<string> {
  const id = crypto.randomUUID()
  const companyId = COMPANY_CONTEXT.companyId
  if (item.state === 'matched' && item.documentId !== undefined) {
    await database.db
      .insert(cargoPreviewDocumentLinks)
      .values({
        companyId,
        documentId: item.documentId,
        linkedBy: 'system',
        previewId: item.previewId,
      })
      .onConflictDoNothing()
  }
  const decided =
    item.state === 'awaiting_xml' ? {} : { matchedAt: new Date(), matchedBy: 'system' as const }
  await database.db.insert(cargoPreviewItems).values({
    companyId,
    id,
    matchEvidence:
      item.suggestedDocumentId === undefined
        ? null
        : { candidateDocumentIds: [item.suggestedDocumentId], evidence: ['value'] },
    matchGroupKey: item.documentId ?? item.suggestedDocumentId ?? null,
    matchState: item.state,
    matchedDocumentId: item.state === 'matched' ? (item.documentId ?? null) : null,
    previewId: item.previewId,
    recipientCode: item.recipientCode ?? null,
    routeName: 'FR.S.CAR',
    rowNumber: item.rowNumber,
    value: '100.00',
    weightKg: '10.000',
    ...decided,
  })
  return id
}

/** O bucket em memória: só o que a prévia usa (gravar e apagar). */
export function createPreviewStorage(): CargoPreviewObjectStoragePort & {
  readonly objects: Map<string, Uint8Array>
} {
  const objects = new Map<string, Uint8Array>()
  return {
    async deleteObject(location) {
      objects.delete(`${location.bucket}/${location.key}`)
    },
    objects,
    async storeObject(object) {
      objects.set(`${object.bucket}/${object.key}`, object.body)
    },
  }
}
