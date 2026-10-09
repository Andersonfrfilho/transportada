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
  'src/business-calendar/infrastructure/holiday-import-removed.query.ts',
  'src/business-calendar/infrastructure/holiday-import-status.query.ts',
  'src/business-calendar/infrastructure/holiday-import-usage.query.ts',
] as const
const STATUS_QUERY = 'src/business-calendar/infrastructure/holiday-import-status.query.ts'
const LAST_RUN_QUERY = 'src/business-calendar/infrastructure/holiday-import-last-run.query.ts'

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
  test('a varredura acha as consultas agregadas do status e o schema do cache', async () => {
    const files = await listSourceFiles()

    for (const query of AGGREGATED_STATUS_QUERIES) expect(files).toContain(query)
    expect(files).toContain('src/database/holiday-provider.schema.ts')
  })

  test('só as consultas agregadas do status (status, removidos e uso) importam as tabelas do cache global', async () => {
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
    const status = await readSource(STATUS_QUERY)

    expect(status).toContain('holidayImportCities')
    expect(status).toContain('companyId')
  })

  test('cada consulta isenta fica em até 200 linhas: a dos removidos mora no arquivo dela', async () => {
    for (const query of AGGREGATED_STATUS_QUERIES) {
      const lines = (await readSource(query)).trimEnd().split('\n').length

      expect({ fitsInLimit: lines <= 200, query }).toEqual({ fitsInLimit: true, query })
    }
    expect(await readSource(STATUS_QUERY)).not.toContain('listRemovedByProvider')
  })

  test('as consultas isentas só leem colunas nomeadas do cache: nenhum `.select()` sem projeção (L5)', async () => {
    for (const query of AGGREGATED_STATUS_QUERIES) {
      const source = await readSource(query)

      expect({ query, wholeRowSelects: source.match(/\.select\(\s*\)/gu) ?? [] }).toEqual({
        query,
        wholeRowSelects: [],
      })
      expect(source).toMatch(/\.select\(\{/u)
    }
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

describe('spec 252 (cartão de status honesto) — a última execução da rotina não é cache do fornecedor', () => {
  test('mora em consulta própria, fora das isentas: `job_executions` é da instalação, não do cache', async () => {
    const files = await listSourceFiles()

    expect(files).toContain(LAST_RUN_QUERY)
    expect(AGGREGATED_STATUS_QUERIES as readonly string[]).not.toContain(LAST_RUN_QUERY)
    expect(await readSource(STATUS_QUERY)).not.toContain('jobExecutions')
  })

  test('a consulta filtra pelo job da rotina e projeta só `outcome` e `finishedAt`', async () => {
    const source = await readSource(LAST_RUN_QUERY)
    const projection = source.match(/\.select\(\{([^}]*)\}\)/u)?.[1] ?? ''

    expect(source).toContain('jobExecutions')
    expect(source).toMatch(/eq\(jobExecutions\.job,/u)
    expect(source).toMatch(/isNotNull\(jobExecutions\.finishedAt\)/u)
    expect(projection.match(/\w+(?=:)/gu)?.sort()).toEqual(['finishedAt', 'outcome'])
    for (const needle of GLOBAL_TABLE_NEEDLES) expect(source).not.toContain(needle)
    for (const column of ['counters', 'correlationId', 'requestedBy', 'companyId']) {
      expect(projection).not.toContain(column)
    }
  })
})

const SETTINGS_REPOSITORY =
  'src/business-calendar/infrastructure/drizzle-holiday-provider-settings.repository.ts'
const SETTINGS_SCHEMA = 'src/database/holiday-provider-settings.schema.ts'
const SETTINGS_NEEDLES = [
  'holidayProviderSettings',
  'database/holiday-provider-settings.schema',
] as const
const SETTINGS_RAW_SQL = /\b(?:from|into|update|join)\s+"?holiday_provider_settings\b/iu

describe('spec 262 — a chave selada da FeriadosAPI é da instalação e só o repositório dela a toca', () => {
  test('a varredura acha o repositório e o schema da tabela', async () => {
    const files = await listSourceFiles()

    expect(files).toContain(SETTINGS_REPOSITORY)
    expect(files).toContain(SETTINGS_SCHEMA)
  })

  test('só o repositório dela importa a tabela: rota, outro repositório, caso de uso e main não', async () => {
    const importers: string[] = []
    for (const file of await listSourceFiles()) {
      if (file.startsWith(SCHEMA_DIRECTORY) || file === SETTINGS_REPOSITORY) continue
      const source = await readSource(file)
      if (
        SETTINGS_NEEDLES.some((needle) => source.includes(needle)) ||
        SETTINGS_RAW_SQL.test(source)
      ) {
        importers.push(file)
      }
    }

    expect(importers).toEqual([])
  })

  test('o repositório devolve só o que `toRecord` escolhe: nunca a linha crua', async () => {
    const source = await readSource(SETTINGS_REPOSITORY)

    expect(source).toContain('holidayProviderSettings')
    expect(source).toMatch(/function toRecord\(/u)
    expect(source).not.toMatch(/return row\s*$/mu)
  })

  test('nenhum arquivo de presentation do calendário chega ao envelope nem a quem alterou', async () => {
    const offenders: string[] = []
    for (const file of await listSourceFiles()) {
      if (!file.startsWith('src/business-calendar/presentation/')) continue
      const source = await readSource(file)
      if (/tokenEnvelope|token_envelope|updatedByUserId/u.test(source)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })
})
