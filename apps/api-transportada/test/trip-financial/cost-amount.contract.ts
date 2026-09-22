/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Defeito anterior à spec 143, herdado da 061: `AMOUNT_PATTERN` aceita `'0'`, e o banco recusa o
 * mesmo lançamento com `CHECK ("amount" > 0)`. O operador que digita R$ 0,00 leva **500** onde o
 * contrato promete 400 — erro de banco vazando como falha interna. A fronteira é que estava frouxa;
 * a constraint já está certa e não se mexe nela.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { parseTripCostRequest } from '../../src/trips/presentation/trip-financial.schema.js'

const COSTS_URL = 'https://api.local/trips/00000000-0000-4000-8000-000000000a11/costs'

function costRequest(amount: string): Request {
  return new Request(COSTS_URL, {
    body: JSON.stringify({ amount, description: 'Pedágio da BR-101', kind: 'toll' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

async function statusOf(amount: string): Promise<number> {
  try {
    await parseTripCostRequest(costRequest(amount))
    return 201
  } catch (error) {
    return error instanceof ApiError ? error.status : 500
  }
}

describe('o lançamento de valor zero é recusado na fronteira, não no banco', () => {
  /** Zero não é custo, e a string já passou pelo padrão: ela vale zero se não tem dígito de 1 a 9. */
  for (const amount of ['0', '0.0000', '0.00', '000']) {
    test(`${amount} devolve 400 em vez de morrer no CHECK do banco`, async () => {
      expect(await statusOf(amount)).toBe(400)
    })
  }

  /** O zero à esquerda é legítimo: cinquenta centavos é `'0.5000'`, e continua entrando. */
  for (const amount of ['0.5000', '0.0001', '1', '9999999999999.9999']) {
    test(`${amount} continua valendo`, async () => {
      expect(await statusOf(amount)).toBe(201)
    })
  }

  /**
   * Valor negativo **continua recusado**: o estorno é spec própria (decisão do usuário), porque
   * precisa resolver permissão, efeito sobre resultado já congelado e trilha de auditoria.
   */
  test('valor negativo continua fora — o ajuste que subtrai é outra spec', async () => {
    expect(await statusOf('-80.0000')).toBe(400)
  })
})
