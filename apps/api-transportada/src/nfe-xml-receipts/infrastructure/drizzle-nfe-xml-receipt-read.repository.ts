/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { nfeImports, nfeXmlReceipts } from '../../database/database.schema.js'
import type {
  NfeXmlReceiptImportView,
  NfeXmlReceiptReadPort,
} from '../application/list-nfe-xml-receipts.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Estados finais da importação: só neles `updated_at` é o momento em que as notas terminaram de entrar. */
const FINAL_IMPORT_STATUSES = new Set(['completed', 'partially_processed', 'failed'])
const EMITTER_ROLE = 'emitter'

type ContractorRow = {
  count: number
  import_id: string
  name: string | null
  tax_id: string | null
}

export function createDrizzleNfeXmlReceiptReadRepository(
  database: Database,
): NfeXmlReceiptReadPort {
  return {
    async listRecent({ companyId, limit }) {
      const rows = await database
        .select()
        .from(nfeXmlReceipts)
        .where(eq(nfeXmlReceipts.companyId, companyId))
        .orderBy(desc(nfeXmlReceipts.createdAt), desc(nfeXmlReceipts.id))
        .limit(limit)
      const importIds = [
        ...new Set(rows.flatMap((row) => (row.importId === null ? [] : [row.importId]))),
      ]
      const imports = await readImports(database, companyId, importIds)
      return rows.map((row) => ({
        channel: row.channel,
        createdAt: row.createdAt.toISOString(),
        filesCount: row.filesCount,
        id: row.id,
        import: row.importId === null ? null : (imports.get(row.importId) ?? null),
        importId: row.importId,
        lastErrorCode: row.lastErrorCode,
        rejectReason: row.rejectReason,
        sender: row.sender,
        status: row.status,
      }))
    },
  }
}

async function readImports(
  database: Database,
  companyId: string,
  importIds: readonly string[],
): Promise<Map<string, NfeXmlReceiptImportView>> {
  const result = new Map<string, NfeXmlReceiptImportView>()
  if (importIds.length === 0) return result

  const importRows = await database
    .select()
    .from(nfeImports)
    .where(and(eq(nfeImports.companyId, companyId), inArray(nfeImports.id, [...importIds])))

  // O contratante da nota é o emitente; o nome vem do cadastro do contratante e, sem ele, do próprio XML.
  const idList = sql.join(
    importIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const contractorRows = (await database.execute(sql`
    select d.import_id, p.tax_id,
           coalesce(nullif(btrim(c.display_name), ''), nullif(btrim(p.legal_name), ''), nullif(btrim(p.trade_name), '')) as name,
           count(*)::int as count
    from nfe_documents d
    left join nfe_participants p
      on p.company_id = d.company_id and p.document_id = d.id and p.role = ${EMITTER_ROLE}
    left join contractors c
      on c.company_id = p.company_id and c.tax_id = p.tax_id
    where d.company_id = ${companyId}::uuid and d.import_id in (${idList})
    group by d.import_id, p.tax_id, 3
    order by count(*) desc
  `)) as unknown as readonly ContractorRow[]

  for (const row of importRows) {
    result.set(row.id, {
      contractors: contractorRows
        .filter((contractor) => contractor.import_id === row.id)
        .map((contractor) => ({
          count: Number(contractor.count),
          name: contractor.name ?? '',
          taxId: contractor.tax_id,
        })),
      counts: {
        duplicated: Number(row.duplicatedCount),
        failed: Number(row.failedCount),
        imported: Number(row.importedCount),
        invalid: Number(row.invalidCount),
        received: Number(row.receivedCount),
        rejected: Number(row.rejectedCount),
      },
      finishedAt: FINAL_IMPORT_STATUSES.has(row.status) ? row.updatedAt.toISOString() : null,
      status: row.status,
    })
  }
  return result
}
