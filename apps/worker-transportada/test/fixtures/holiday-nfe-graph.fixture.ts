/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252: empresa com notas e endereços de destino contra o Postgres de integração. Dados inventados;
 * cada teste usa uma empresa nova. Semeia em série (o pool do Bun SQL trava com muitas cadeias de INSERT
 * concorrentes).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type SeedParticipant = {
  readonly cityCode: string | null
  readonly number?: string | null
  /** `undefined` usa um CEP de oito dígitos; `null` deixa o endereço sem CEP utilizável. */
  readonly postalCode?: string | null
  readonly role: 'delivery' | 'recipient'
}

export type SeedHolidayDocumentInput = {
  readonly issuedAt?: string
  readonly participants: readonly SeedParticipant[]
  /** Texto com microssegundos: o cursor precisa distinguir o que o `Date` do JavaScript junta. */
  readonly updatedAt?: string
}

export type HolidayNfeGraph = {
  readonly companyId: string
  readonly seedBulkDocuments: (input: {
    readonly cityCode: string
    readonly count: number
    readonly prefix: string
  }) => Promise<void>
  readonly seedDocument: (input: SeedHolidayDocumentInput) => Promise<string>
}

const DEFAULT_POSTAL_CODE = '13010000'

function accessKeyFor(seed: string): string {
  const digits = createHash('sha256').update(seed).digest('hex').replace(/[a-f]/gu, '7')
  return digits.padEnd(44, '1').slice(0, 44)
}

export async function createHolidayNfeGraph(database: Database): Promise<HolidayNfeGraph> {
  const [companyId, userId, importId, xmlObjectId] = [1, 2, 3, 4].map(() =>
    crypto.randomUUID(),
  ) as [string, string, string, string]
  const hexOf = (id: string) => id.replaceAll('-', '').padEnd(64, '0')

  await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
  await database.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
  await database.execute(sql`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`)
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

  async function seedDocument(input: SeedHolidayDocumentInput): Promise<string> {
    const documentId = crypto.randomUUID()
    const updatedAt = input.updatedAt ?? '2026-09-01 10:00:00.000000+00'
    const issuedAt = input.issuedAt ?? '2026-08-20 06:00:00.000000+00'
    await database.execute(sql`
      insert into nfe_documents (id, company_id, access_key, model, number, series, issued_at,
        operation_nature, operation_type, status, authorization_protocol, source, total_value,
        products_value, xml_object_id, xml_sha256, import_id, created_by_user_id, created_at,
        updated_at)
      values (${documentId}, ${companyId}, ${accessKeyFor(documentId)}, '55', '1', '1',
        ${issuedAt}::timestamptz, 'Venda', '1', 'authorized', '135240000000001', 'upload',
        '10.00', '10.00', ${xmlObjectId}, ${hexOf(xmlObjectId)}, ${importId}, ${userId},
        ${updatedAt}::timestamptz, ${updatedAt}::timestamptz)`)
    for (const participant of input.participants) {
      const participantId = crypto.randomUUID()
      await database.execute(sql`
        insert into nfe_participants (id, company_id, document_id, role, tax_id)
        values (${participantId}, ${companyId}, ${documentId}, ${participant.role}, '11222333000181')`)
      await database.execute(sql`
        insert into nfe_addresses (company_id, participant_id, postal_code, number, city_code, city, state)
        values (${companyId}, ${participantId},
          ${participant.postalCode === undefined ? DEFAULT_POSTAL_CODE : participant.postalCode},
          ${participant.number === undefined ? '100' : participant.number},
          ${participant.cityCode}, 'CIDADE', 'SP')`)
    }
    return documentId
  }

  async function seedBulkDocuments(input: {
    readonly cityCode: string
    readonly count: number
    readonly prefix: string
  }): Promise<void> {
    await database.execute(sql`
      insert into nfe_documents (id, company_id, access_key, model, number, series, issued_at,
        operation_nature, operation_type, status, authorization_protocol, source, total_value,
        products_value, xml_object_id, xml_sha256, import_id, created_by_user_id, created_at,
        updated_at)
      select gen_random_uuid(), ${companyId}, rpad(${input.prefix} || lpad(g::text, 10, '0'), 44, '1'), '55',
        g::text, '1', '2026-08-20T06:00:00Z'::timestamptz + (g || ' seconds')::interval, 'Venda', '1',
        'authorized', '135240000000001', 'upload', '10.00', '10.00', ${xmlObjectId},
        ${hexOf(xmlObjectId)}, ${importId}, ${userId}, now(),
        '2026-09-01T00:00:00Z'::timestamptz + (g || ' seconds')::interval
      from generate_series(1, ${input.count}) as g`)
    await database.execute(sql`
      insert into nfe_participants (id, company_id, document_id, role, tax_id)
      select gen_random_uuid(), company_id, id, 'recipient', '11222333000181'
      from nfe_documents d
      where d.company_id = ${companyId}
        and d.access_key like ${`${input.prefix}%`}
        and not exists (select 1 from nfe_participants p where p.document_id = d.id)`)
    await database.execute(sql`
      insert into nfe_addresses (company_id, participant_id, postal_code, number, city_code, city, state)
      select p.company_id, p.id, ${DEFAULT_POSTAL_CODE}, '100', ${input.cityCode}, 'CIDADE', 'SP'
      from nfe_participants p
      where p.company_id = ${companyId}
        and not exists (select 1 from nfe_addresses a where a.participant_id = p.id)`)
  }

  return { companyId, seedBulkDocuments, seedDocument }
}
