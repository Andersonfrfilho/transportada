/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T3.5 (CA8): sem token a rotina não é registrada e a janela dela pousa em
 * `job_run_routine_missing`; o token mora só no worker, em `.env.example` e em `.railway/railway.ts`
 * sem valor; nenhuma outra app o conhece.
 */
import { readFile } from 'node:fs/promises'

import { Glob } from 'bun'
import { describe, expect, test } from 'bun:test'

import { createJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type { JobExecutionPort } from '../../src/job-run/application/job-execution.port.js'
import { buildHolidayProviderPullRegistry } from '../../src/holiday-provider-pull/infrastructure/holiday-provider-pull.registry.js'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const NOW = new Date('2026-10-09T12:00:00.000Z')

function buildLogger(logged: Array<{ readonly level: string; readonly message: string }>) {
  const at = (level: string) => (message: string) => {
    logged.push({ level, message })
  }
  return { debug: at('debug'), error: at('error'), info: at('info'), warn: at('warn') } as never
}

describe('o registro condicional da rotina (spec 252 T3.5, CA8)', () => {
  test('sem token nada é registrado', () => {
    const registry = buildHolidayProviderPullRegistry({
      config: {},
      database: {} as never,
      logger: buildLogger([]),
    })

    expect(Object.keys(registry)).toEqual([])
  })

  test('com token a rotina é registrada, com o nome do catálogo', () => {
    const registry = buildHolidayProviderPullRegistry({
      config: { holidayProviderPull: { monthlyRequestBudget: 300, token: 'fixture-token' } },
      database: {} as never,
      logger: buildLogger([]),
    })

    expect(Object.keys(registry)).toEqual(['holiday.provider.pull'])
    expect(typeof registry['holiday.provider.pull']?.run).toBe('function')
  })

  test('sem a rotina registrada a janela fecha em `unexpected_error` com `job_run_routine_missing`', async () => {
    const logged: Array<{ readonly level: string; readonly message: string }> = []
    const finished: Array<{ readonly outcome: string }> = []
    const executions: JobExecutionPort = {
      claim: async () => ({ job: 'holiday.provider.pull', origin: 'schedule' }),
      finish: async (params) => {
        finished.push({ outcome: params.outcome })
      },
      renew: async () => ({ cancelRequestedAt: undefined }),
    }
    const cycle = createJobCycle({
      executions,
      logger: buildLogger(logged),
      now: () => NOW,
      routines: buildHolidayProviderPullRegistry({
        config: {},
        database: {} as never,
        logger: buildLogger([]),
      }),
    })

    await cycle.run({
      envelope: { correlationId: 'registration', payload: { executionId: 'execution-1' } } as never,
    })

    expect(finished).toEqual([{ outcome: 'unexpected_error' }])
    expect(logged).toContainEqual({ level: 'error', message: 'job_run_routine_missing' })
  })

  test('o `main.ts` monta o registro pela configuração validada, sem ler o ambiente cru', async () => {
    const main = await readFile(new URL('src/main.ts', new URL('../../', import.meta.url)), 'utf8')

    expect(main).toContain('...buildHolidayProviderPullRegistry({')
    expect(main).not.toMatch(/process\.env\.FERIADOS/u)
  })
})

describe('onde o token mora (spec 252 T3.5, D10)', () => {
  test('`.env.example` declara as duas variáveis sem valor', async () => {
    const example = await readFile(new URL('.env.example', REPOSITORY_ROOT), 'utf8')

    expect(example).toMatch(/^FERIADOS_API_TOKEN=$/mu)
    expect(example).toMatch(/^FERIADOS_API_MONTHLY_REQUEST_BUDGET=$/mu)
  })

  test('`.railway/railway.ts` as declara com `preserve()` só no worker', async () => {
    const railway = await readFile(new URL('.railway/railway.ts', REPOSITORY_ROOT), 'utf8')
    const start = railway.indexOf("const worker = service('worker'")
    const end = railway.indexOf("const panel = service('transportada-frontend'")
    const workerBlock = railway.slice(start, end)

    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    for (const key of ['FERIADOS_API_TOKEN', 'FERIADOS_API_MONTHLY_REQUEST_BUDGET']) {
      expect(workerBlock).toContain(`${key}: preserve(),`)
      expect(railway.split(`${key}:`)).toHaveLength(2)
    }
  })

  test('nenhuma outra app lê o token', async () => {
    const offenders: string[] = []
    for await (const path of new Glob('apps/*/src/**/*.{ts,tsx}').scan({
      cwd: REPOSITORY_ROOT.pathname,
    })) {
      if (path.startsWith('apps/worker-transportada/')) continue
      const text = await readFile(new URL(path, REPOSITORY_ROOT), 'utf8')
      if (text.includes('FERIADOS_API_TOKEN')) offenders.push(path)
    }

    expect(offenders).toEqual([])
  })

  test('no worker, só o schema de ambiente conhece o nome da variável', async () => {
    const readers: string[] = []
    for await (const path of new Glob('src/**/*.ts').scan({
      cwd: new URL('../../', import.meta.url).pathname,
    })) {
      const text = await readFile(new URL(path, new URL('../../', import.meta.url)), 'utf8')
      if (text.includes('FERIADOS_API_TOKEN')) readers.push(path)
    }

    expect(readers).toEqual(['src/config/environment.schema.ts'])
  })
})
