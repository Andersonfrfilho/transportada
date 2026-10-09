/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §3, "A exceção do companyId"): as três tabelas do cache global do fornecedor
 * não têm `company_id` e nunca saem crus por rota. Nenhum arquivo da API, de `presentation` ou de
 * repositório, as importa — exceto as duas consultas agregadas do status: uma recorta o cache pelas cidades
 * da própria empresa, a outra lê o contador do mês da instalação. Molde:
 * `test/trip-domain/delivery-deadline-isolation.contract.ts`.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../../', import.meta.url)
const SOURCE_GLOB = 'src/**/*.ts'
const SCHEMA_DIRECTORY = 'src/database/'
const GLOBAL_TABLE_NEEDLES = [
  'holidayProviderFetches',
  'holidayProviderEntries',
  'holidayProviderMonthlyUsage',
  'holiday_provider_fetches',
  'holiday_provider_entries',
  'holiday_provider_monthly_usage',
  'holiday-provider.schema',
] as const
const AGGREGATED_STATUS_QUERIES = [
  'src/business-calendar/infrastructure/holiday-import-status.query.ts',
  'src/business-calendar/infrastructure/holiday-import-usage.query.ts',
] as const

async function listSourceFiles(): Promise<readonly string[]> {
  const files: string[] = []
  const glob = new Bun.Glob(SOURCE_GLOB)
  for await (const file of glob.scan({ cwd: APPLICATION_ROOT.pathname })) files.push(file)

  return files.sort()
}

async function readSource(file: string): Promise<string> {
  return Bun.file(new URL(file, APPLICATION_ROOT)).text()
}

describe('spec 252 — o cache global do fornecedor de feriados não sai cru', () => {
  test('a varredura acha as duas consultas agregadas do status e o schema do cache', async () => {
    const files = await listSourceFiles()

    for (const query of AGGREGATED_STATUS_QUERIES) expect(files).toContain(query)
    expect(files).toContain('src/database/holiday-provider.schema.ts')
  })

  test('só as consultas agregadas do status importam as tabelas do cache global', async () => {
    const importers: string[] = []
    for (const file of await listSourceFiles()) {
      if (file.startsWith(SCHEMA_DIRECTORY)) continue
      if ((AGGREGATED_STATUS_QUERIES as readonly string[]).includes(file)) continue
      const source = await readSource(file)
      if (GLOBAL_TABLE_NEEDLES.some((needle) => source.includes(needle))) importers.push(file)
    }

    expect(importers).toEqual([])
  })

  test('as consultas agregadas partem da demanda da empresa, não do cache', async () => {
    const status = await readSource(AGGREGATED_STATUS_QUERIES[0])

    expect(status).toContain('holidayImportCities')
    expect(status).toContain('companyId')
  })

  test('nenhum arquivo de presentation chega ao cache: as visões são lista branca', async () => {
    const offenders: string[] = []
    for (const file of await listSourceFiles()) {
      if (!file.includes('/presentation/')) continue
      const source = await readSource(file)
      if (/\bdatabase\/holiday-provider\b/u.test(source)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })
})
