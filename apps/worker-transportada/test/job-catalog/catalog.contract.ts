/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
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
} from '../../src/shared/job-catalog.constant.js'

/**
 * Cópia por valor entre quatro apps que não importam código umas das outras: a lista literal se
 * repete aqui de propósito, para a paridade ser assertada em vez de suposta.
 */
const CATALOG = [
  {
    failureOutcomes: [
      'company_disabled',
      'not_opted_in',
      'missing_synthetic_membership',
      'certificate_missing',
      'certificate_not_yet_valid',
      'certificate_expired',
      'cooldown_active',
    ],
    job: 'nfe.distribution.pull',
    minimumIntervalSeconds: 300,
  },
  {
    failureOutcomes: [
      'anp_unreachable',
      'anp_week_not_published',
      'anp_malformed_workbook',
      'aneel_unreachable',
      'aneel_empty_slice',
    ],
    job: 'fuel.price.pull',
    minimumIntervalSeconds: 86_400,
  },
  {
    failureOutcomes: [
      'provider_unreachable',
      'malformed_response',
      'credential_missing',
      'document_unavailable',
    ],
    job: 'nfse.status.pull',
    minimumIntervalSeconds: 300,
  },
  {
    failureOutcomes: ['queue_unreachable', 'template_missing'],
    job: 'notification.schedules.run',
    minimumIntervalSeconds: 300,
  },
  {
    /** Spec 057: a rotina só toca o próprio banco — o que pode dar errado é o imprevisto, e o
     * invólucro já tem nome para ele. */
    failureOutcomes: [],
    job: 'trip.location.purge',
    minimumIntervalSeconds: 86_400,
  },
  {
    /** O provedor é o único de fora que ela toca, e é a única coisa que pode faltar. */
    failureOutcomes: ['identity_provider_unreachable'],
    job: 'identity.document.backfill',
    minimumIntervalSeconds: 86_400,
  },
  {
    failureOutcomes: [],
    job: 'geocoding.backfill',
    minimumIntervalSeconds: 3600,
  },
  {
    /** ADR-0062: `deferred` preserva a chance paga do endereço, então nada aqui é falha do ciclo. */
    failureOutcomes: [],
    job: 'geocoding.refine',
    minimumIntervalSeconds: 3600,
  },
] as const

describe('worker job catalog', () => {
  test('matches the API catalog: same routines, same order, same floors, same vocabularies', () => {
    expect(JOB_CATALOG).toEqual(CATALOG)
    expect(SCHEDULED_JOBS).toEqual(CATALOG.map((entry) => entry.job))
  })

  test('agrees with the API on the tick and on the ceiling that keeps interval from becoming a pause', () => {
    expect(JOB_TICK_INTERVAL_SECONDS).toBe(300)
    expect(JOB_MAXIMUM_INTERVAL_SECONDS).toBe(7_776_000)
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
    for (const entry of CATALOG) {
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
})
