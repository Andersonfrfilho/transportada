/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: o grafo da prévia contra o Postgres de integração — empresa, contratante com o
 * perfil ligado (mapa FR, padrão do `NroCarga`), a prévia na fila e as notas do emitente dele.
 * Dados inventados; cada teste usa uma empresa nova (a trilha é append-only e não se apaga).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'

import { FR_COLUMN_MAP } from './cargo-preview-workbook.fixture.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export const CONTRACTOR_TAX_ID = '30290856000160'
export const LOAD_PATTERN = 'NroCarga[: ]*([0-9]+)'

export type SeedDocumentInput = {
  /** Só a nota, sem emitente, destinatário nem volumes: quem grava os filhos é a importação. */
  readonly bare?: boolean
  readonly createdAt?: Date
  readonly emitterTaxId?: string
  readonly loadReference?: string
  readonly number: string
  readonly postalCode?: string
  readonly recipientName?: string
  readonly recipientTaxId: string
  readonly value: string
  readonly weightKg: string | null
}

export type CargoPreviewGraph = {
  readonly companyId: string
  readonly contractorId: string
  readonly seedDocument: (input: SeedDocumentInput) => Promise<string>
  readonly seedPreview: (input: {
    readonly bytes: Uint8Array
    readonly receivedAt: Date
  }) => Promise<string>
}

function accessKeyFor(seed: string): string {
  const digits = createHash('sha256').update(seed).digest('hex').replace(/[a-f]/gu, '7')
  return digits.padEnd(44, '1').slice(0, 44)
}

export async function createCargoPreviewGraph(database: Database): Promise<CargoPreviewGraph> {
  const [companyId, userId, contractorId, importId, xmlObjectId] = [1, 2, 3, 4, 5].map(() =>
    crypto.randomUUID(),
  ) as [string, string, string, string, string]
  const hexOf = (id: string) => id.replaceAll('-', '').padEnd(64, '0')
  await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
  await database.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
  await database.execute(sql`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`)
  await database.execute(sql`
    insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, ${CONTRACTOR_TAX_ID})`)
  await database.execute(sql`
    insert into contractor_receiving_profiles
      (company_id, contractor_id, is_enabled, preview_enabled, preview_column_map,
       preview_sheet_name, arrival_reference_pattern)
    values (${companyId}, ${contractorId}, true, true, ${JSON.stringify(FR_COLUMN_MAP)}::text::jsonb,
      'IMPORTAÇÃO', ${LOAD_PATTERN})`)
  await database.execute(sql`
    insert into stored_objects (id, company_id, provider, bucket, object_key, purpose, mime_type,
      sha256, size_bytes, status)
    values (${xmlObjectId}, ${companyId}, 's3', 'integration', ${`xml/${xmlObjectId}.xml`},
      'nfe_document', 'application/xml', ${hexOf(xmlObjectId)}, 100, 'final')`)
  await database.execute(sql`
    insert into nfe_imports (id, company_id, source, requested_by_user_id, correlation_id,
      idempotency_key, request_fingerprint, status)
    values (${importId}, ${companyId}, 'upload', ${userId}, ${`corr-${importId}`},
      ${`idem-${importId}`}, ${hexOf(importId)}, 'completed')`)

  async function seedPreview(input: { readonly bytes: Uint8Array; readonly receivedAt: Date }) {
    const id = crypto.randomUUID()
    const sha256 = createHash('sha256').update(input.bytes).digest('hex')
    await database.execute(sql`
      insert into cargo_previews (id, company_id, contractor_id, source, status, received_at,
        file_name, file_sha256, file_object_id, file_size_bytes, uploaded_by_user_id,
        idempotency_key, request_fingerprint)
      values (${id}, ${companyId}, ${contractorId}, 'upload', 'queued', ${input.receivedAt},
        'FR-05-10.xlsm', ${sha256}, ${crypto.randomUUID()}, ${input.bytes.byteLength}, ${userId},
        ${`preview-key-${id}`}, ${sha256})`)
    return id
  }

  async function seedDocument(input: SeedDocumentInput): Promise<string> {
    const documentId = crypto.randomUUID()
    const recipientId = crypto.randomUUID()
    const info =
      input.loadReference === undefined ? null : `LACRE 1 NroCarga: ${input.loadReference}`
    await database.execute(sql`
      insert into nfe_documents (id, company_id, access_key, model, number, series, issued_at,
        operation_nature, operation_type, status, authorization_protocol, source, total_value,
        products_value, additional_information, xml_object_id, xml_sha256, import_id,
        created_by_user_id, created_at)
      values (${documentId}, ${companyId}, ${accessKeyFor(documentId)}, '55', ${input.number}, '1',
        ${new Date('2026-10-02T22:00:00.000Z')}, 'Venda', '1', 'authorized', '135240000000001',
        'upload', ${input.value}, ${input.value}, ${info}, ${xmlObjectId}, ${hexOf(xmlObjectId)},
        ${importId}, ${userId}, ${input.createdAt ?? new Date()})`)
    if (input.bare === true) return documentId
    await database.execute(sql`
      insert into nfe_participants (company_id, document_id, role, tax_id)
      values (${companyId}, ${documentId}, 'emitter', ${input.emitterTaxId ?? CONTRACTOR_TAX_ID})`)
    await database.execute(sql`
      insert into nfe_participants (id, company_id, document_id, role, tax_id, legal_name)
      values (${recipientId}, ${companyId}, ${documentId}, 'recipient', ${input.recipientTaxId},
        ${input.recipientName ?? null})`)
    await database.execute(sql`
      insert into nfe_addresses (company_id, participant_id, postal_code, city, state)
      values (${companyId}, ${recipientId}, ${input.postalCode ?? null}, 'SAO CARLOS', 'SP')`)
    if (input.weightKg !== null) {
      await database.execute(sql`
        insert into nfe_volumes (company_id, document_id, ordinal, quantity, gross_weight, net_weight)
        values (${companyId}, ${documentId}, 1, 1, ${input.weightKg}, ${input.weightKg})`)
    }
    return documentId
  }

  return { companyId, contractorId, seedDocument, seedPreview }
}
