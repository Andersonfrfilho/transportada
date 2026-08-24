/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { DISTRIBUTION_INELIGIBILITY_REASONS } from '../../src/companies/domain/distribution-eligibility.policy.js'
import { JOB_SCHEDULE_MINIMUM_INTERVAL_SECONDS } from '../../src/database/job-schedule.schema.js'
import {
  JOB_CATALOG,
  JOB_FAILURE_OUTCOMES,
  JOB_MAXIMUM_INTERVAL_SECONDS,
  JOB_MINIMUM_INTERVAL_SECONDS,
  JOB_OUTCOME_MAX_LENGTH,
  JOB_OUTCOMES,
  JOB_TICK_INTERVAL_SECONDS,
  JOB_WRAPPER_OUTCOMES,
  SCHEDULED_JOBS,
  isJobOutcome,
  isScheduledJob,
} from '../../src/shared/job-catalog.constant.js'
import { migrationsDirectory } from '../database-migration/support.js'

/**
 * Cópia por valor entre quatro apps que não importam código umas das outras: a lista literal se
 * repete aqui de propósito, para a paridade ser assertada em vez de suposta — a mesma disciplina de
 * `fuel-catalog/catalog.contract.ts`.
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
] as const

const MIGRATION = '20260823175600_job_schedule_registry'

describe('job catalog', () => {
  test('names the four routines, in the order the clock seeds them', () => {
    expect(JOB_CATALOG).toEqual(CATALOG)
    expect(SCHEDULED_JOBS).toEqual(CATALOG.map((entry) => entry.job))
  })

  test('recognizes a routine by name, and refuses one it never heard of', () => {
    expect(isScheduledJob('fuel.price.pull')).toBe(true)
    expect(isScheduledJob('fuel.price')).toBe(false)
    expect(isScheduledJob(undefined)).toBe(false)
  })

  /**
   * O piso da rotina nunca pode ser mais fino que a batida: janela abaixo dela é janela que a batida
   * nunca encontra vencida no instante certo, e o banco já recusa pelo CHECK.
   */
  test('never lets a routine ask for a window finer than the tick', () => {
    expect(JOB_SCHEDULE_MINIMUM_INTERVAL_SECONDS).toBe(JOB_TICK_INTERVAL_SECONDS)
    for (const entry of JOB_CATALOG) {
      expect(entry.minimumIntervalSeconds).toBeGreaterThanOrEqual(JOB_TICK_INTERVAL_SECONDS)
      expect(entry.minimumIntervalSeconds).toBeLessThanOrEqual(JOB_MAXIMUM_INTERVAL_SECONDS)
    }
  })

  /**
   * A coleta pública não bate de minuto em minuto: a ANP publica uma vez por semana e a ANEEL
   * homologa por vigência, então o piso dela é o dia — errar a digitação do intervalo não pode
   * virar motivo para a agência nos bloquear.
   */
  test('holds the public collection to one day, and lets the contracted provider run at the tick', () => {
    expect(JOB_MINIMUM_INTERVAL_SECONDS['fuel.price.pull']).toBe(86_400)
    expect(JOB_MINIMUM_INTERVAL_SECONDS['nfse.status.pull']).toBe(JOB_TICK_INTERVAL_SECONDS)
    expect(JOB_MINIMUM_INTERVAL_SECONDS['nfe.distribution.pull']).toBe(JOB_TICK_INTERVAL_SECONDS)
  })

  /**
   * O intervalo que já está gravado não pode ser recusado pelo próprio piso: o seed da migration é
   * o estado inicial de toda instalação, e um piso acima dele faria a primeira edição na tela
   * devolver 422 sobre um valor que o produto escolheu.
   */
  test('accepts every interval the migration already seeded', async () => {
    const seeded = await readSeededIntervals()

    expect(Object.keys(seeded).sort()).toEqual([...SCHEDULED_JOBS].sort())
    for (const [job, intervalSeconds] of Object.entries(seeded)) {
      expect(intervalSeconds).toBeGreaterThanOrEqual(
        JOB_MINIMUM_INTERVAL_SECONDS[job as keyof typeof JOB_MINIMUM_INTERVAL_SECONDS],
      )
      expect(intervalSeconds).toBeLessThanOrEqual(JOB_MAXIMUM_INTERVAL_SECONDS)
    }
  })

  /**
   * Intervalo não é caminho para desligar rotina: desligar tem controle próprio, e ele se anuncia na
   * tela com desde quando e por quem. Janela de um ano seria pausa disfarçada de agendamento.
   */
  test('refuses to let an interval become a silent pause', () => {
    const NINETY_DAYS_IN_SECONDS = 7_776_000
    expect(JOB_MAXIMUM_INTERVAL_SECONDS).toBe(NINETY_DAYS_IN_SECONDS)
  })

  test('gives every routine the same lifecycle vocabulary, written by the wrapper', () => {
    expect(JOB_WRAPPER_OUTCOMES).toEqual([
      'succeeded',
      'cancelled',
      'abandoned',
      'unexpected_error',
    ])
  })

  test('gives each routine its own failure vocabulary', () => {
    for (const entry of CATALOG) {
      expect(JOB_FAILURE_OUTCOMES[entry.job]).toEqual(entry.failureOutcomes)
    }
  })

  /** O vocabulário da distribuição é o que a policy de elegibilidade já publica, não uma segunda lista. */
  test('borrows the distribution vocabulary from the eligibility policy', () => {
    expect(JOB_FAILURE_OUTCOMES['nfe.distribution.pull']).toEqual([
      ...DISTRIBUTION_INELIGIBILITY_REASONS,
    ])
  })

  test('offers each routine the lifecycle codes plus its own failures, and nothing else', () => {
    for (const entry of CATALOG) {
      expect(JOB_OUTCOMES[entry.job]).toEqual([...JOB_WRAPPER_OUTCOMES, ...entry.failureOutcomes])
    }
  })

  /**
   * A rotina não empresta o código da outra: "malformed_response" numa coleta de preço não diria
   * nada ao operador, e é a tradução por rotina que o painel usa para escrever a frase.
   */
  test('never lends one routine the failure code of another', () => {
    expect(isJobOutcome({ job: 'nfse.status.pull', outcome: 'malformed_response' })).toBe(true)
    expect(isJobOutcome({ job: 'fuel.price.pull', outcome: 'malformed_response' })).toBe(false)
    expect(isJobOutcome({ job: 'fuel.price.pull', outcome: 'anp_unreachable' })).toBe(true)
    for (const entry of CATALOG) {
      expect(isJobOutcome({ job: entry.job, outcome: 'succeeded' })).toBe(true)
      expect(isJobOutcome({ job: entry.job, outcome: 'deu ruim' })).toBe(false)
    }
  })

  /** Código estável cabe na coluna e é legível em log: minúscula, sem acento e sem espaço. */
  test('keeps every code short enough for the column, and shaped like a code', () => {
    for (const entry of CATALOG) {
      for (const outcome of [...JOB_WRAPPER_OUTCOMES, ...entry.failureOutcomes]) {
        expect(outcome.length).toBeLessThanOrEqual(JOB_OUTCOME_MAX_LENGTH)
        expect(outcome).toMatch(/^[a-z][a-z0-9_]*$/)
      }
    }
  })

  /** Vocabulário de falha que repete um código do ciclo faria "sucesso" e "falhou" serem a mesma linha. */
  test('keeps the failure vocabulary clear of the lifecycle codes', () => {
    for (const entry of CATALOG) {
      for (const outcome of entry.failureOutcomes) {
        expect(JOB_WRAPPER_OUTCOMES).not.toContain(outcome)
      }
    }
  })
})

async function readSeededIntervals(): Promise<Record<string, number>> {
  const sql = await Bun.file(join(migrationsDirectory.pathname, MIGRATION, 'migration.sql')).text()
  const seeded: Record<string, number> = {}
  const pattern = /\('([a-z.]+)',\s*(\d+),/g
  for (const match of sql.matchAll(pattern)) {
    const [, job, intervalSeconds] = match
    if (job === undefined || intervalSeconds === undefined) continue
    seeded[job] = Number(intervalSeconds)
  }
  return seeded
}
