// Roda DENTRO do container do worker (cwd = /app/apps/worker-transportada).
// Recoloca na fila as importações cujos itens foram TODOS recusados com NFE_IMPORT_UNRELATED_CNPJ
// (notas de emitente contratante recusadas antes do #626). O consumidor relê cada item da importação,
// então basta republicar o evento `transportada.nfe.import.requested`. Importação com qualquer item
// que não seja essa recusa fica de fora (reprocessá-la trocaria "importada" por "duplicada").
// Sem APPLY=1 só conta (simulação). Imprime só linhas __RESULT__ com contagens, nunca chave ou XML.
const DIST = '/app/apps/worker-transportada/dist'
const hours = Number(process.env.HOURS ?? '72')
const apply = process.env.APPLY === '1'
if (!Number.isFinite(hours) || hours <= 0 || hours > 720) {
  console.log('__RESULT__ erro=horas_invalidas')
  process.exit(2)
}

const { createDrizzleProvider } = await import('@adatechnology/drizzle-provider')
const { and, eq, gte, sql } = await import('drizzle-orm')
const { nfeImports, nfeImportItems } = await import(`${DIST}/database/nfe.schema.js`)
const { processingOutbox } = await import(`${DIST}/database/processing.schema.js`)

const database = createDrizzleProvider({
  connection: { connection: { TimeZone: 'UTC' }, url: process.env.DATABASE_URL },
})
const db = database.db

try {
  const since = new Date(Date.now() - hours * 3600 * 1000)
  const rows = await db
    .select({
      importId: nfeImportItems.importId,
      itemStatus: nfeImportItems.status,
      error: nfeImportItems.error,
      companyId: nfeImports.companyId,
      importStatus: nfeImports.status,
      requestedBy: nfeImports.requestedByUserId,
      correlationId: nfeImports.correlationId,
    })
    .from(nfeImportItems)
    .innerJoin(nfeImports, eq(nfeImports.id, nfeImportItems.importId))
    .where(gte(nfeImports.createdAt, since))

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
        await tx
          .update(nfeImports)
          .set({ status: 'queued', terminalError: null, updatedAt: new Date(), version: sql`${nfeImports.version} + 1` })
          .where(and(eq(nfeImports.companyId, e.companyId), eq(nfeImports.id, importId)))
        await tx.insert(processingOutbox).values({
          actorUserId: e.requestedBy,
          aggregateId: importId,
          aggregateType: 'nfe_import',
          companyId: e.companyId,
          correlationId: e.correlationId,
          eventId: crypto.randomUUID(),
          eventType: 'transportada.nfe.import.requested',
          eventVersion: 1n,
          payload: { importId },
          triggeredBy: 'user',
        })
      }
    })
    console.log(`__RESULT__ aplicado importacoes=${targets.length} itens=${items}`)
  }
} finally {
  await database.close?.()
}
