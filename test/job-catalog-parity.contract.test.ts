/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O catálogo de rotinas vive em quatro cópias por valor, porque nenhuma app importa código de outra.
 * Cada app prende a sua a uma lista literal; nada prendia as quatro entre si. Uma rotina fora do
 * catálogo do cron abria a execução e quebrava o envelope em seguida (spec 299). Este contrato lê as
 * quatro cópias e exige que sejam idênticas, entrada a entrada.
 */
import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'

type CatalogEntry = {
  readonly failureOutcomes: readonly string[]
  readonly job: string
  readonly minimumIntervalSeconds: number
}

type CatalogModule = {
  readonly JOB_CATALOG: readonly CatalogEntry[]
  readonly JOB_WRAPPER_OUTCOMES: readonly string[]
}

const ROOT = resolve(import.meta.dir, '..')

const COPIES = {
  api: 'apps/api-transportada/src/shared/job-catalog.constant.ts',
  cron: 'apps/cron-transportada/src/shared/job-catalog.constant.ts',
  frontend: 'apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts',
  worker: 'apps/worker-transportada/src/shared/job-catalog.constant.ts',
} as const

async function loadCopy(relativePath: string): Promise<CatalogModule> {
  return (await import(resolve(ROOT, relativePath))) as CatalogModule
}

function summarize(module: CatalogModule) {
  return {
    entries: module.JOB_CATALOG.map((entry) => ({
      failureOutcomes: [...entry.failureOutcomes],
      job: entry.job,
      minimumIntervalSeconds: entry.minimumIntervalSeconds,
    })),
    wrapperOutcomes: [...module.JOB_WRAPPER_OUTCOMES],
  }
}

describe('job catalog copies stay identical across apps', () => {
  test('worker, api, cron and panel declare the same routines, floors and vocabulary', async () => {
    const [worker, api, cron, frontend] = await Promise.all([
      loadCopy(COPIES.worker),
      loadCopy(COPIES.api),
      loadCopy(COPIES.cron),
      loadCopy(COPIES.frontend),
    ])
    const reference = summarize(worker)

    expect(reference.entries.length).toBeGreaterThan(0)
    expect(summarize(api)).toEqual(reference)
    expect(summarize(cron)).toEqual(reference)
    expect(summarize(frontend)).toEqual(reference)
  })
})
