/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  isWithinDeliveryWindow,
  resolveDeliveryWindow,
} from '../../src/delivery-clients/domain/delivery-window.policy.js'

/** 2026-08-27 é uma quinta-feira; 2026-08-29, um sábado. */
const THURSDAY = '2026-08-27'
const SATURDAY = '2026-08-29'
const THURSDAY_WEEKDAY = 4

const MORNING = { closesAt: '11:00:00', opensAt: '08:00:00', weekday: THURSDAY_WEEKDAY }
const AFTERNOON = { closesAt: '16:00:00', opensAt: '14:00:00', weekday: THURSDAY_WEEKDAY }

const EMPTY = { exceptions: [], holidays: [], windows: [] } as const

describe('a hora em que o cliente recebe (spec 060 T004)', () => {
  /** A conta do dia da semana não passa por `Date`: `new Date('2026-08-27')` é UTC, e em São Paulo
   * isso vira o dia anterior às 21h — a quinta cadastrada viraria quarta, calada. */
  test('acha o dia da semana certo, sem fuso no caminho', () => {
    expect(
      resolveDeliveryWindow({ ...EMPTY, date: THURSDAY, windows: [MORNING] }).intervals,
    ).toEqual([{ closesAt: '11:00:00', opensAt: '08:00:00' }])
    expect(
      resolveDeliveryWindow({ ...EMPTY, date: SATURDAY, windows: [MORNING] }).intervals,
    ).toEqual([])
  })

  /** O almoço fechado é a razão de a janela ser lista: duas colunas não representam o buraco. */
  test('devolve os dois intervalos do dia, em ordem', () => {
    const resolved = resolveDeliveryWindow({
      ...EMPTY,
      date: THURSDAY,
      windows: [AFTERNOON, MORNING],
    })

    expect(resolved.intervals).toEqual([
      { closesAt: '11:00:00', opensAt: '08:00:00' },
      { closesAt: '16:00:00', opensAt: '14:00:00' },
    ])
    expect(isWithinDeliveryWindow({ ...EMPTY, date: THURSDAY, time: '12:30', windows: [AFTERNOON, MORNING] })).toBe(
      false,
    )
    expect(isWithinDeliveryWindow({ ...EMPTY, date: THURSDAY, time: '15:00', windows: [AFTERNOON, MORNING] })).toBe(
      true,
    )
  })

  /** Quem fecha às 11h não recebe às 11h em ponto: a borda superior é exclusiva. */
  test('a abertura entra e o fechamento não', () => {
    const day = { ...EMPTY, date: THURSDAY, windows: [MORNING] }

    expect(isWithinDeliveryWindow({ ...day, time: '08:00' })).toBe(true)
    expect(isWithinDeliveryWindow({ ...day, time: '10:59:59' })).toBe(true)
    expect(isWithinDeliveryWindow({ ...day, time: '11:00' })).toBe(false)
    expect(isWithinDeliveryWindow({ ...day, time: '07:59' })).toBe(false)
  })

  /**
   * A janela que cruza a meia-noite é **dois** intervalos, um em cada dia. É por isso que a política
   * não precisa de caso especial — e este teste guarda a representação, não o caso especial.
   */
  test('a janela que cruza a meia-noite atravessa como dois dias', () => {
    const nightBefore = { closesAt: '23:59:59', opensAt: '22:00:00', weekday: THURSDAY_WEEKDAY }
    const nightAfter = { closesAt: '02:00:00', opensAt: '00:00:00', weekday: 5 }
    const windows = [nightBefore, nightAfter]

    expect(isWithinDeliveryWindow({ ...EMPTY, date: THURSDAY, time: '23:00', windows })).toBe(true)
    expect(isWithinDeliveryWindow({ ...EMPTY, date: '2026-08-28', time: '01:00', windows })).toBe(
      true,
    )
    expect(isWithinDeliveryWindow({ ...EMPTY, date: '2026-08-28', time: '03:00', windows })).toBe(
      false,
    )
  })

  test('a exceção que fecha fecha o dia inteiro', () => {
    const resolved = resolveDeliveryWindow({
      date: THURSDAY,
      exceptions: [{ closesAt: null, exceptionOn: THURSDAY, kind: 'closed', opensAt: null }],
      holidays: [],
      windows: [MORNING],
    })

    expect(resolved).toEqual({ intervals: [], source: 'exception' })
  })

  test('o feriado do município fecha sem ninguém tocar no cliente', () => {
    const resolved = resolveDeliveryWindow({
      date: THURSDAY,
      exceptions: [],
      holidays: [{ holidayOn: THURSDAY }],
      windows: [MORNING],
    })

    expect(resolved).toEqual({ intervals: [], source: 'holiday' })
  })

  /**
   * ADR-0048 §3, e é a decisão que mais importa aqui: **a exceção do cliente vence o feriado**. Sem
   * isso, o CD que trabalha no feriado da cidade sumiria do roteiro justamente no dia em que é o
   * único aberto.
   */
  test('a exceção do cliente vence o feriado do município, nos dois sentidos', () => {
    const open = resolveDeliveryWindow({
      date: THURSDAY,
      exceptions: [{ closesAt: '12:00:00', exceptionOn: THURSDAY, kind: 'open', opensAt: '09:00:00' }],
      holidays: [{ holidayOn: THURSDAY }],
      windows: [MORNING],
    })
    expect(open).toEqual({
      intervals: [{ closesAt: '12:00:00', opensAt: '09:00:00' }],
      source: 'exception',
    })

    // E o contrário também: o cliente que fecha num dia que a cidade não fechou.
    const closed = resolveDeliveryWindow({
      date: THURSDAY,
      exceptions: [{ closesAt: null, exceptionOn: THURSDAY, kind: 'closed', opensAt: null }],
      holidays: [],
      windows: [MORNING],
    })
    expect(closed.intervals).toEqual([])
  })

  /**
   * Ausência de janela é ausência, não "fechado". A maioria dos destinatários recebe a qualquer
   * hora, e tratá-los como fechados travaria a operação inteira no dia seguinte ao deploy.
   */
  test('cliente sem janela cadastrada aceita qualquer hora, e diz que não tem regra', () => {
    expect(resolveDeliveryWindow({ ...EMPTY, date: THURSDAY }).source).toBe('unset')
    expect(isWithinDeliveryWindow({ ...EMPTY, date: THURSDAY, time: '03:00' })).toBe(true)
  })

  /**
   * Vetor conferido à mão contra o calendário, e ele existe para a conta do dia da semana não se
   * autoprovar: ano bissexto, virada de século que **não** é bissexta (2100) e a que é (2000).
   */
  test('acerta bissexto e virada de século', () => {
    for (const [date, weekday] of [
      ['2026-01-01', 4],
      ['2026-02-28', 6],
      ['2024-02-29', 4],
      ['2026-03-01', 0],
      ['2000-02-29', 2],
      ['2100-03-01', 1],
      ['2026-12-31', 4],
    ] as const) {
      const open = resolveDeliveryWindow({
        ...EMPTY,
        date,
        windows: [{ closesAt: '11:00', opensAt: '08:00', weekday }],
      })

      expect({ date, intervals: open.intervals.length }).toEqual({ date, intervals: 1 })
    }
  })

  /** Mas o cliente que recebe seg–sex **está** fechado no sábado — e isso não é ausência de regra. */
  test('cliente com janela está fechado fora dela', () => {
    const saturday = { ...EMPTY, date: SATURDAY, windows: [MORNING] }

    expect(resolveDeliveryWindow(saturday).source).toBe('weekly')
    expect(isWithinDeliveryWindow({ ...saturday, time: '09:00' })).toBe(false)
  })

  /** O banco devolve `08:00:00` e a tela manda `08:00`: são o mesmo horário. */
  test('aceita hora com e sem segundos', () => {
    const day = { ...EMPTY, date: THURSDAY, windows: [{ closesAt: '11:00', opensAt: '08:00', weekday: THURSDAY_WEEKDAY }] }

    expect(isWithinDeliveryWindow({ ...day, time: '09:00:00' })).toBe(true)
    expect(isWithinDeliveryWindow({ ...day, time: '09:00' })).toBe(true)
  })
})
