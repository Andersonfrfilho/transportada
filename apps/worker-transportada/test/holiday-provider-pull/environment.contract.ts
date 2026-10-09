/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  parseWorkerEnvironment,
  WorkerConfigurationError,
} from '../../src/config/environment.schema.js'

const BASE_ENVIRONMENT = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
} as const

const TOKEN = 'fixture-token-0123456789'

function parse(extra: Record<string, string>) {
  return parseWorkerEnvironment({ ...BASE_ENVIRONMENT, ...extra })
}

describe('a configuração da importação de feriados no worker (spec 252 T3.5, D10)', () => {
  test('sem token a rotina não existe e o boot segue verde', () => {
    expect(parse({}).holidayProviderPull).toBeUndefined()
    expect('holidayProviderPull' in parse({})).toBeFalse()
  })

  test('vazio e só espaços são ausência, como a chave do Google', () => {
    for (const token of ['', '   ']) {
      expect(parse({ FERIADOS_API_TOKEN: token }).holidayProviderPull).toBeUndefined()
    }
    expect(
      parse({ FERIADOS_API_MONTHLY_REQUEST_BUDGET: '', FERIADOS_API_TOKEN: '' })
        .holidayProviderPull,
    ).toBeUndefined()
  })

  test('com token e sem orçamento vale o padrão de 4.500 (plano Developer menos 10%, Q3 em aberto)', () => {
    expect(parse({ FERIADOS_API_TOKEN: TOKEN }).holidayProviderPull).toEqual({
      monthlyRequestBudget: 4500,
      token: TOKEN,
    })
    expect(
      parse({ FERIADOS_API_MONTHLY_REQUEST_BUDGET: '', FERIADOS_API_TOKEN: TOKEN })
        .holidayProviderPull?.monthlyRequestBudget,
    ).toBe(4500)
  })

  test('o orçamento é um inteiro a partir de 1, aparado', () => {
    expect(
      parse({ FERIADOS_API_MONTHLY_REQUEST_BUDGET: ' 300 ', FERIADOS_API_TOKEN: TOKEN })
        .holidayProviderPull?.monthlyRequestBudget,
    ).toBe(300)
    expect(
      parse({ FERIADOS_API_MONTHLY_REQUEST_BUDGET: '1', FERIADOS_API_TOKEN: TOKEN })
        .holidayProviderPull?.monthlyRequestBudget,
    ).toBe(1)
  })

  test('orçamento torto derruba o boot, com ou sem token', () => {
    for (const budget of ['0', '-5', '1.5', 'abc', '1e3x', '12 345']) {
      expect(() => parse({ FERIADOS_API_MONTHLY_REQUEST_BUDGET: budget })).toThrow(
        WorkerConfigurationError,
      )
      expect(() =>
        parse({ FERIADOS_API_MONTHLY_REQUEST_BUDGET: budget, FERIADOS_API_TOKEN: TOKEN }),
      ).toThrow(WorkerConfigurationError)
    }
  })

  test('o orçamento sozinho, sem token, não liga a rotina', () => {
    expect(
      parse({ FERIADOS_API_MONTHLY_REQUEST_BUDGET: '300' }).holidayProviderPull,
    ).toBeUndefined()
  })

  test('o erro de configuração não carrega o valor do token', () => {
    try {
      parse({ FERIADOS_API_MONTHLY_REQUEST_BUDGET: 'abc', FERIADOS_API_TOKEN: TOKEN })
      throw new Error('expected a configuration error')
    } catch (error: unknown) {
      expect(String(error)).not.toContain(TOKEN)
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error as object))).not.toContain(
        TOKEN,
      )
    }
  })
})
