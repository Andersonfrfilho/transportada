/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  JOB_CATALOG,
  JOB_FAILURE_OUTCOMES,
  JOB_MAXIMUM_INTERVAL_SECONDS,
  JOB_OUTCOMES,
  JOB_TICK_INTERVAL_SECONDS,
  JOB_WRAPPER_OUTCOMES,
  SCHEDULED_JOBS,
  isJobOutcome,
  isScheduledJob,
} from '@/modules/shared/jobCatalog.constant'
import { DISTRIBUTION_INELIGIBILITY_REASONS } from '@/modules/nfe-workspace/shared/scheduledDistribution.constant'

/**
 * A paridade é contra o **fonte da API**, não contra uma lista restatada aqui: a lista local
 * envelheceu junto com a constante e deixou `geocoding.refine` de fora das duas sem reprovar nada.
 */
const API_CATALOG_SOURCE = readFileSync(
  new URL('../../../api-transportada/src/shared/job-catalog.constant.ts', import.meta.url),
  'utf8',
).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

type ApiCatalogEntry = {
  readonly failureOutcomes: readonly string[]
  readonly job: string
  readonly minimumIntervalSeconds: number
}

function readApiNumber(name: string): number {
  const match = new RegExp(`export const ${name} = ([0-9_]+)`).exec(API_CATALOG_SOURCE)
  if (match?.[1] === undefined) throw new Error(`${name} not found in the API catalog`)
  return Number(match[1].replaceAll('_', ''))
}

function resolveApiInterval(token: string): number {
  if (/^[0-9_]+$/.test(token)) return Number(token.replaceAll('_', ''))
  return readApiNumber(token)
}

function readApiCatalog(): readonly ApiCatalogEntry[] {
  const block = API_CATALOG_SOURCE.split('export const JOB_CATALOG = [')[1]?.split('] as const')[0]
  if (block === undefined) throw new Error('JOB_CATALOG not found in the API catalog')
  const entryPattern =
    /failureOutcomes:\s*\[([^\]]*)\],\s*job:\s*'([^']+)',\s*minimumIntervalSeconds:\s*([A-Z_0-9]+)/g
  const entries = [...block.matchAll(entryPattern)].map((match) => ({
    failureOutcomes: [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map(
      (outcome) => outcome[1] ?? '',
    ),
    job: match[2] ?? '',
    minimumIntervalSeconds: resolveApiInterval(match[3] ?? ''),
  }))
  const declaredJobs = [...block.matchAll(/\bjob:\s*'/g)].length
  if (entries.length === 0 || entries.length !== declaredJobs) {
    throw new Error('the API catalog changed shape; the parity parser needs to follow it')
  }
  return entries
}

const CATALOG = readApiCatalog()

describe('frontend job catalog', () => {
  test('matches the API catalog: same routines, same order, same floors, same vocabularies', () => {
    expect<readonly ApiCatalogEntry[]>(JOB_CATALOG).toEqual(CATALOG)
    expect<readonly string[]>(SCHEDULED_JOBS).toEqual(CATALOG.map((entry) => entry.job))
  })

  test('agrees with the API on the tick and on the ceiling that keeps interval from becoming a pause', () => {
    expect(JOB_TICK_INTERVAL_SECONDS).toBe(readApiNumber('JOB_TICK_INTERVAL_SECONDS'))
    expect(JOB_MAXIMUM_INTERVAL_SECONDS).toBe(readApiNumber('JOB_MAXIMUM_INTERVAL_SECONDS'))
    for (const entry of JOB_CATALOG) {
      expect(entry.minimumIntervalSeconds).toBeGreaterThanOrEqual(JOB_TICK_INTERVAL_SECONDS)
      expect(entry.minimumIntervalSeconds).toBeLessThanOrEqual(JOB_MAXIMUM_INTERVAL_SECONDS)
    }
  })

  test('writes the same four lifecycle codes the wrapper writes on the other side', () => {
    expect(JOB_WRAPPER_OUTCOMES).toEqual([
      'succeeded',
      'cancelled',
      'abandoned',
      'unexpected_error',
    ])
  })

  test('offers each routine the lifecycle codes plus its own failures, and nothing else', () => {
    for (const entry of JOB_CATALOG) {
      expect(JOB_FAILURE_OUTCOMES[entry.job]).toEqual(entry.failureOutcomes)
      expect(JOB_OUTCOMES[entry.job]).toEqual([...JOB_WRAPPER_OUTCOMES, ...entry.failureOutcomes])
    }
  })

  /**
   * A rotina não empresta o código da outra: `malformed_response` numa coleta de preço não diria
   * nada ao operador, e é a tradução por rotina que escreve a frase do cartão.
   */
  test('never lends one routine the failure code of another', () => {
    expect(isJobOutcome({ job: 'nfse.status.pull', outcome: 'malformed_response' })).toBe(true)
    expect(isJobOutcome({ job: 'fuel.price.pull', outcome: 'malformed_response' })).toBe(false)
    expect(isScheduledJob('fuel.price.pull')).toBe(true)
    expect(isScheduledJob('fuel.price')).toBe(false)
  })

  /** O cartão da distribuição traduz as mesmas razões que a aba Remota já traduz hoje. */
  test('borrows the distribution vocabulary from the list the workspace already translates', () => {
    expect(JOB_FAILURE_OUTCOMES['nfe.distribution.pull']).toEqual([
      ...DISTRIBUTION_INELIGIBILITY_REASONS,
    ])
  })
})
