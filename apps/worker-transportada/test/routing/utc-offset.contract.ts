/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { utcOffsetSeconds } from '../../src/routing/infrastructure/drizzle-route-optimization.repository.js'

const HOUR_SECONDS = 3_600

describe('o fuso da operação (spec 058 P2)', () => {
  /**
   * A janela do cliente é hora **local** e o relógio do solver conta da meia-noite UTC: sem esta
   * conta, o roteiro proporia chegada três horas antes de a portaria abrir.
   */
  test('São Paulo soma três horas', () => {
    expect(utcOffsetSeconds({ date: '2026-08-28', timezone: 'America/Sao_Paulo' })).toBe(
      3 * HOUR_SECONDS,
    )
  })

  /** O país tem mais de um fuso, e era **por isso** que a constante fixa não servia. */
  test('o Acre soma cinco', () => {
    expect(utcOffsetSeconds({ date: '2026-08-28', timezone: 'America/Rio_Branco' })).toBe(
      5 * HOUR_SECONDS,
    )
  })

  /**
   * O deslocamento é resolvido **na data**, não uma vez: onde há horário de verão ele muda no meio do
   * ano, e é essa mudança que a constante fixa não conseguia acompanhar. Lisboa serve de prova porque
   * o Brasil não tem mais horário de verão — o problema, porém, é o mesmo.
   */
  test('acompanha o horário de verão de quem o tem', () => {
    const winter = utcOffsetSeconds({ date: '2026-01-15', timezone: 'Europe/Lisbon' })
    const summer = utcOffsetSeconds({ date: '2026-07-15', timezone: 'Europe/Lisbon' })

    expect(winter).toBe(0)
    expect(summer).toBe(-1 * HOUR_SECONDS)
  })

  /**
   * Nome digitado errado no cadastro não pode deixar a empresa sem roteiro: cai em UTC, a hora fica
   * errada e a conta continua fechando. É o mesmo princípio da janela ausente — degradar, não travar.
   */
  test('fuso desconhecido cai em UTC em vez de derrubar a sugestão', () => {
    expect(utcOffsetSeconds({ date: '2026-08-28', timezone: 'Marte/Olympus_Mons' })).toBe(0)
  })
})
