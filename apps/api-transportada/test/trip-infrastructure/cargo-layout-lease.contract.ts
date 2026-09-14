/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import {
  CARGO_LAYOUT_MAX_ATTEMPTS,
  resolveCargoLayoutLeaseMs,
} from '../../src/trips/domain/cargo-layout-lease.policy.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

const WORKER_POLICY = new URL(
  '../../../worker-transportada/src/cargo-layout/application/cargo-layout-budget.policy.ts',
  import.meta.url,
)
const WORKER_TOPOLOGY = new URL(
  '../../../worker-transportada/src/messaging/cargo-layout-topology.ts',
  import.meta.url,
)
const API_POLICY = new URL('../../src/trips/domain/cargo-layout-lease.policy.ts', import.meta.url)

const CONSTANT_LINE = /^(?:export )?const (CARGO_LAYOUT_[A-Z_]+_MS) = ([\d_]+)$/gm
const FUNCTION_BLOCK = /^export function (resolveCargoLayout[A-Za-z]+)\([\s\S]*?^}$/gm

function readNamedMatches(source: string, pattern: RegExp): Map<string, string> {
  return new Map([...source.matchAll(pattern)].map((match) => [match[1] ?? '', match[0]]))
}

/**
 * ⚠️ **Cópia por valor.** A API reabre `queued`/`running` pelo mesmo lease com que o worker
 * reivindica (D14/D16). Um lease menor na API reabre planta viva e o cálculo corre duas vezes; maior,
 * e a planta presa espera mais do que o worker esperaria.
 */
describe('cargo layout lease parity with the worker (spec 145 D14/D16)', () => {
  test('the API copies the worker budget and lease formula, constant by constant', async () => {
    const [worker, api] = await Promise.all([
      readFile(WORKER_POLICY, 'utf8'),
      readFile(API_POLICY, 'utf8'),
    ])

    const workerConstants = [...worker.matchAll(CONSTANT_LINE)].map((match) => match.slice(1, 3))
    const apiConstants = new Map(
      [...api.matchAll(CONSTANT_LINE)].map((match) => [match[1], match[2]]),
    )
    expect(workerConstants.length).toBe(2)
    for (const [name, value] of workerConstants) {
      expect(`${name}=${apiConstants.get(name ?? '')}`).toBe(`${name}=${value}`)
    }

    const workerFunctions = readNamedMatches(worker, FUNCTION_BLOCK)
    const apiFunctions = readNamedMatches(api, FUNCTION_BLOCK)
    expect([...workerFunctions.keys()].sort()).toEqual([
      'resolveCargoLayoutBudgetMs',
      'resolveCargoLayoutLeaseMs',
    ])
    for (const [name, body] of workerFunctions) {
      expect(apiFunctions.get(name)).toBe(body)
    }
  })

  /** O worker deriva as tentativas da topologia: `maxRetries + 1`. */
  test('the attempt count is the worker topology retries plus the first attempt', async () => {
    const topology = await readFile(WORKER_TOPOLOGY, 'utf8')
    const maxRetries = /maxRetries: (\d+),/.exec(topology)?.[1]

    expect(Number(maxRetries) + 1).toBe(CARGO_LAYOUT_MAX_ATTEMPTS)
  })

  test('the default budget gives the 520 s lease the worker measured', () => {
    expect(
      resolveCargoLayoutLeaseMs({ baseBudgetMs: 120_000, maxAttempts: CARGO_LAYOUT_MAX_ATTEMPTS }),
    ).toBe(520_000)
    expect(
      resolveCargoLayoutLeaseMs({ baseBudgetMs: 1_000, maxAttempts: CARGO_LAYOUT_MAX_ATTEMPTS }),
    ).toBe(44_000)
  })
})

describe('cargo layout time budget environment (spec 145 D14)', () => {
  test('absent, the budget is 120 000 ms, as in the worker', () => {
    expect(parseEnvironment(API_ENVIRONMENT).cargoLayoutTimeBudgetMs).toBe(120_000)
  })

  test('a declared budget reaches the configuration', () => {
    const environment = parseEnvironment({
      ...API_ENVIRONMENT,
      CARGO_LAYOUT_TIME_BUDGET_MS: '90000',
    })

    expect(environment.cargoLayoutTimeBudgetMs).toBe(90_000)
  })

  test.each(['abc', '0', '999', '600001', '1.5'])('refuses %s at boot', (value) => {
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, CARGO_LAYOUT_TIME_BUDGET_MS: value }),
    ).toThrow()
  })
})
