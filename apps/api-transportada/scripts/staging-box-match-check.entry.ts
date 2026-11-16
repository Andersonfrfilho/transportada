/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Diagnóstico (somente leitura): por que a linha de "o que falta medir" ficou "Sem caixa do catálogo".
 * Reproduz a regra de `findBoxIdsForPendingMeasurements`: caixa = (empresa, CNPJ do emitente, cProd, uCom), e o casamento
 * pela nota usa só o NÚMERO da nota (duas notas com o mesmo número em emitentes diferentes tornam a caixa ambígua).
 * Roda DENTRO do container da api (bundle de `tmp/ops/staging-caixa-sem-casar-confere.sh`).
 * Imprime só linhas `__RESULT__` com número da nota, código/unidade/descrição do produto e contagens. Sem CNPJ, endereço ou credencial.
 */
import { sql } from 'drizzle-orm'

import { createDatabaseProvider } from '../src/database/database-client.service.js'

type Row = Record<string, unknown>

const databaseUrl = process.env.DATABASE_URL
const numbers = (process.env.DOCUMENT_NUMBERS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => /^[0-9]{1,12}$/.test(value))
if (databaseUrl === undefined || databaseUrl === '' || numbers.length === 0) {
  console.log('__RESULT__ erro=ambiente_incompleto (DATABASE_URL ou DOCUMENT_NUMBERS)')
  process.exit(2)
}

const provider = createDatabaseProvider({
  pool: { connectTimeoutSeconds: 10, max: 2, queryTimeoutMs: 30_000 },
  url: databaseUrl,
} as Parameters<typeof createDatabaseProvider>[0])
const database = provider.db as unknown as { execute: (query: unknown) => Promise<unknown> }

function rowsOf(result: unknown): readonly Row[] {
  if (Array.isArray(result)) return result as Row[]
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? (rows as Row[]) : []
}

const numberList = sql.join(
  numbers.map((value) => sql`${value}`),
  sql`, `,
)

const rows = rowsOf(
  await database.execute(sql`
    select d.number as nota,
      (select count(*) from nfe_documents x where x.company_id = d.company_id and x.number = d.number) as notas_mesmo_numero,
      p.code as codigo, p.commercial_unit as unidade, left(p.description, 40) as produto,
      coalesce(length(e.tax_id), 0) as emitente_cnpj_len,
      (select count(*) from nfe_package_boxes b
        where b.company_id = p.company_id and b.emitter_tax_id = e.tax_id
          and b.product_code = p.code and b.commercial_unit = p.commercial_unit) as caixas_exatas,
      (select count(*) from nfe_package_boxes b
        where b.company_id = p.company_id and b.emitter_tax_id = e.tax_id
          and b.product_code = p.code and b.commercial_unit <> p.commercial_unit) as caixas_outra_unidade,
      (select count(*) from nfe_package_boxes b
        where b.company_id = p.company_id and b.emitter_tax_id <> coalesce(e.tax_id, '')
          and b.product_code = p.code and b.commercial_unit = p.commercial_unit) as caixas_outro_emitente,
      (select count(*) from nfe_package_boxes b
        where b.company_id = p.company_id and b.emitter_tax_id = e.tax_id
          and b.product_code = p.code and b.commercial_unit = p.commercial_unit
          and b.measured_at is not null) as caixas_medidas
    from nfe_documents d
    join nfe_products p on p.document_id = d.id and p.company_id = d.company_id
    left join nfe_participants e on e.document_id = d.id and e.company_id = d.company_id and e.role = 'emitter'
    where d.number in (${numberList})
    order by d.number, p.code
  `),
)

function diagnose(row: Row): string {
  if (Number(row.emitente_cnpj_len) === 0) return 'emitente_sem_cnpj'
  if (Number(row.caixas_exatas) === 0) {
    if (Number(row.caixas_outro_emitente) > 0) return 'caixa_so_de_outro_emitente'
    if (Number(row.caixas_outra_unidade) > 0) return 'caixa_so_em_outra_unidade'
    return 'sem_caixa_cadastrada(backfill)'
  }
  if (Number(row.notas_mesmo_numero) > 1) return 'numero_de_nota_repetido(ambiguo)'
  return 'caixa_existe(casaria)'
}

console.log(`__RESULT__ linhas=${rows.length} notas=${numbers.join('|')}`)
for (const row of rows) {
  console.log(
    `__RESULT__ nota=${String(row.nota)} codigo=${String(row.codigo)} un=${String(row.unidade)} produto="${String(row.produto)}" ` +
      `notas_mesmo_numero=${String(row.notas_mesmo_numero)} emitente_cnpj_len=${String(row.emitente_cnpj_len)} ` +
      `caixas_exatas=${String(row.caixas_exatas)} medidas=${String(row.caixas_medidas)} ` +
      `outra_unidade=${String(row.caixas_outra_unidade)} outro_emitente=${String(row.caixas_outro_emitente)} ` +
      `diagnostico=${diagnose(row)}`,
  )
}
process.exit(0)
