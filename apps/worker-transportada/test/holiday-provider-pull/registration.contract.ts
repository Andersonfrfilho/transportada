/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T4.2 (CA8): a rotina é registrada sempre (a chave e o orçamento vêm do banco a cada ciclo) e a
 * janela dela deixou de pousar em `job_run_routine_missing`. T4.3 (D4): as variáveis `FERIADOS_API_TOKEN` e
 * `FERIADOS_API_MONTHLY_REQUEST_BUDGET` saíram do schema, dos tipos, do `.env.example` e do `railway.ts`.
 */
import { readFile } from 'node:fs/promises'

import { Glob } from 'bun'
import { describe, expect, test } from 'bun:test'

import { buildHolidayProviderPullRegistry } from '../../src/holiday-provider-pull/infrastructure/holiday-provider-pull.registry.js'
import { INSTALLATION_PROVIDER } from '../fixtures/holiday-provider-token-seal.fixture.js'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const WORKER_ROOT = new URL('../../', import.meta.url)

function buildLogger() {
  const nothing = () => undefined
  return { debug: nothing, error: nothing, info: nothing, warn: nothing } as never
}

describe('o registro da rotina é incondicional (spec 262 T4.2, CA8)', () => {
  test('a rotina está no registro com o nome do catálogo, sem depender de nenhuma variável', () => {
    const registry = buildHolidayProviderPullRegistry({
      database: {} as never,
      envelopeProvider: INSTALLATION_PROVIDER,
      logger: buildLogger(),
    })

    expect(Object.keys(registry)).toEqual(['holiday.provider.pull'])
    expect(typeof registry['holiday.provider.pull']?.run).toBe('function')
  })

  test('o `main.ts` monta o registro com o chaveiro e sem a configuração de ambiente', async () => {
    const main = await readFile(new URL('src/main.ts', WORKER_ROOT), 'utf8')
    const start = main.indexOf('...buildHolidayProviderPullRegistry({')
    const call = main.slice(start, main.indexOf('}),', start))

    expect(start).toBeGreaterThan(-1)
    expect(call).toContain(
      'envelopeProvider: createSecretEnvelopeProvider(cryptography.envelopeKeyRing)',
    )
    expect(call).not.toContain('config')
    expect(main).not.toMatch(/process\.env\.FERIADOS/u)
  })

  test('o registro e a rotina não leem o ambiente: a chave e o orçamento vêm do banco a cada ciclo', async () => {
    const sources = await Promise.all(
      [
        'src/holiday-provider-pull/infrastructure/holiday-provider-pull.registry.ts',
        'src/holiday-provider-pull/application/holiday-provider-pull.routine.ts',
        'src/holiday-provider-pull/application/fetch-holiday-provider-with-access.use-case.ts',
      ].map((path) => readFile(new URL(path, WORKER_ROOT), 'utf8')),
    )

    for (const source of sources) {
      expect(source).not.toContain('process.env')
      expect(source).not.toContain('FERIADOS_API_TOKEN')
      expect(source).not.toContain('holidayProviderPull')
    }
  })
})

describe('onde o token deixou de morar (spec 262 T4.3, D4, CA9)', () => {
  test('`.env.example` não declara mais a chave nem o orçamento', async () => {
    const example = await readFile(new URL('.env.example', REPOSITORY_ROOT), 'utf8')

    expect(example).not.toContain('FERIADOS_API_TOKEN')
    expect(example).not.toContain('FERIADOS_API_MONTHLY_REQUEST_BUDGET')
  })

  test('`.railway/railway.ts` não declara mais a chave nem o orçamento (omitir é apagar, no `apply` do usuário)', async () => {
    const railway = await readFile(new URL('.railway/railway.ts', REPOSITORY_ROOT), 'utf8')

    expect(railway).not.toContain('FERIADOS_API_TOKEN')
    expect(railway).not.toContain('FERIADOS_API_MONTHLY_REQUEST_BUDGET')
  })

  test('nenhuma app, nem o worker, lê o nome da variável', async () => {
    const offenders: string[] = []
    for await (const path of new Glob('apps/*/src/**/*.{ts,tsx}').scan({
      cwd: REPOSITORY_ROOT.pathname,
    })) {
      const text = await readFile(new URL(path, REPOSITORY_ROOT), 'utf8')
      if (text.includes('FERIADOS_API_TOKEN')) offenders.push(path)
      if (text.includes('FERIADOS_API_MONTHLY_REQUEST_BUDGET')) offenders.push(path)
    }

    expect(offenders).toEqual([])
  })

  test('os tipos do worker não têm mais a configuração da importação de feriados', async () => {
    const types = await readFile(new URL('src/shared/worker.types.ts', WORKER_ROOT), 'utf8')

    expect(types).not.toContain('HolidayProviderPullEnvironment')
    expect(types).not.toContain('holidayProviderPull')
  })
})
