// Roda DENTRO do container do worker (cwd = /app/apps/worker-transportada).
// Recoloca na fila as importações cujos itens foram TODOS recusados com NFE_IMPORT_UNRELATED_CNPJ
// (notas de emitente contratante recusadas antes do #626). O consumidor relê cada item da importação,
// então basta republicar o evento `transportada.nfe.import.requested`. Importação com qualquer item
// que não seja essa recusa fica de fora (reprocessá-la trocaria "importada" por "duplicada").
// Sem APPLY=1 só conta (simulação). Imprime só linhas __RESULT__ com contagens, nunca chave ou XML.
const hours = Number(process.env.HOURS ?? '72')
const apply = process.env.APPLY === '1'
if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
  console.log('__RESULT__ erro=horas_invalidas')
  process.exit(2)
}

const { createDrizzleProvider } = await import('@adatechnology/drizzle-provider')
const { sql } = await import('drizzle-orm')
// O container so tem dist/main.js e os entrypoints empacotados (sem dist/database/*): SQL cru, nomes de coluna do banco.
const asRows = (result) => (Array.isArray(result) ? result : (result?.rows ?? []))

const database = createDrizzleProvider({
  connection: { connection: { TimeZone: 'UTC' }, url: process.env.DATABASE_URL },
})
const db = database.db

try {
  const since = new Date(Date.now() - hours * 3600 * 1000)
  const rows = asRows(
    await db.execute(sql`
      select i.import_id as "importId", i.status as "itemStatus", i.error as "error",
             n.company_id as "companyId", n.status as "importStatus",
             n.requested_by_user_id as "requestedBy", n.correlation_id as "correlationId"
      from nfe_import_items i
      join nfe_imports n on n.id = i.import_id
      where n.created_at >= ${since.toISOString()}::timestamptz`),
  )

  const byImport = new Map()
  for (const row of rows) {
    const entry = byImport.get(row.importId) ?? { ...row, items: 0, eligible: true }
    entry.items += 1
    const recusa = row.itemStatus === 'rejected' && row.error?.code === 'NFE_IMPORT_UNRELATED_CNPJ'
    if (!recusa) entry.eligible = false
    byImport.set(row.importId, entry)
  }
  const busy = new Set(['pending', 'queued', 'processing'])
  const targets = [...byImport.entries()].filter(([, e]) => e.eligible && !busy.has(e.importStatus))
  const items = targets.reduce((sum, [, e]) => sum + e.items, 0)
  console.log(
    `__RESULT__ modo=${apply ? 'APLICAR' : 'SIMULACAO'} horas=${hours} importacoes_no_periodo=${byImport.size} elegiveis=${targets.length} itens=${items}`,
  )

  if (apply && targets.length > 0) {
    await db.transaction(async (tx) => {
      for (const [importId, e] of targets) {
        await tx.execute(sql`
          update nfe_imports
          set status = 'queued', terminal_error = null, updated_at = now(), version = version + 1
          where company_id = ${e.companyId}::uuid and id = ${importId}::uuid`)
        await tx.execute(sql`
          insert into processing_outbox
            (company_id, event_id, aggregate_type, aggregate_id, event_type, event_version,
             actor_user_id, triggered_by, correlation_id, payload)
          values
            (${e.companyId}::uuid, ${crypto.randomUUID()}::uuid, 'nfe_import', ${importId}::uuid,
             'transportada.nfe.import.requested', 1, ${e.requestedBy}::uuid, 'user',
             ${e.correlationId}, ${JSON.stringify({ importId })}::jsonb)`)
      }
    })
    console.log(`__RESULT__ aplicado importacoes=${targets.length} itens=${items}`)
  }
} finally {
  await database.close?.()
}
