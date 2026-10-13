/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T4.3 (D4, CA9): `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` deixaram de existir —
 * a chave e o orçamento moram no banco e a tela os configura. O schema do worker não é `.strict()`: a variável que
 * sobrar no Railway é ignorada, nunca derruba o boot e nunca vira configuração.
 */
import { describe, expect, test } from 'bun:test'

import { parseWorkerEnvironment } from '../../src/config/environment.schema.js'

const BASE_ENVIRONMENT = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
} as const

const TOKEN = 'FAKE-feriados-key-Q7zK-0123456789'

function parse(extra: Record<string, string>) {
  return parseWorkerEnvironment({ ...BASE_ENVIRONMENT, ...extra })
}

describe('a importação de feriados não tem mais configuração de ambiente no worker (spec 262 T4.3)', () => {
  test('o ambiente validado não carrega `holidayProviderPull`, com ou sem as variáveis antigas', () => {
    const cases: ReadonlyArray<Record<string, string>> = [
      {},
      { FERIADOS_API_TOKEN: TOKEN },
      { FERIADOS_API_MONTHLY_REQUEST_BUDGET: '300', FERIADOS_API_TOKEN: TOKEN },
    ]

    for (const extra of cases) {
      expect('holidayProviderPull' in parse(extra)).toBeFalse()
    }
  })

  test('a variável que sobrar no Railway é ignorada: nem derruba o boot, nem vira configuração', () => {
    const leftovers: ReadonlyArray<Record<string, string>> = [
      { FERIADOS_API_TOKEN: 'valor com espaço e acentuação é' },
      { FERIADOS_API_MONTHLY_REQUEST_BUDGET: 'abc' },
      { FERIADOS_API_MONTHLY_REQUEST_BUDGET: '1000001', FERIADOS_API_TOKEN: TOKEN },
      { FERIADOS_API_MONTHLY_REQUEST_BUDGET: '0', FERIADOS_API_TOKEN: '' },
    ]

    for (const extra of leftovers) {
      expect(() => parse(extra)).not.toThrow()
      expect(JSON.stringify(parse(extra))).not.toContain('FERIADOS')
    }
  })

  test('o valor da variável que sobrar não aparece em nenhum campo do ambiente validado', () => {
    expect(JSON.stringify(parse({ FERIADOS_API_TOKEN: TOKEN }))).not.toContain(TOKEN)
  })
})
