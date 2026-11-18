/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  consolidateReceivingWindows,
  parseReceivingHoursFromNote,
} from '../../src/delivery-clients/domain/receiving-hours-note.policy.js'

function windowsOf(text: string): string[] | null {
  const parsed = parseReceivingHoursFromNote(text)
  return parsed === null
    ? null
    : parsed.map((w) => `${w.weekday} ${w.opensAt.slice(0, 5)}-${w.closesAt.slice(0, 5)}`)
}

const WEEK = [1, 2, 3, 4, 5]
const every = (days: number[], ...ranges: string[]) =>
  days.flatMap((day) => ranges.map((range) => `${day} ${range}`))

/**
 * Casos reais das notas de staging e produção (medido em 18/11/2026). O texto vem depois de
 * "Obs. Cliente:", sempre dentro do infCpl com lacre, carga e ICMS ST antes.
 */
describe('o horário de recebimento escrito na nota', () => {
  test('lê "segunda a sexta" com manhã e tarde', () => {
    expect(
      windowsOf(
        'LACRE: 1021657 - NroCarga: 41893 B.Calc.ST: 3152.29 ICMS ST: 142.40.Obs. Cliente: HORARIO DE RECEBIMENTO DE SEGUNDA A SEXTA DAS 08:00 AS 11:00 HORAS E DAS 13:00 AS 17:00 HORAS',
      ),
    ).toEqual(every(WEEK, '08:00-11:00', '13:00-17:00'))
  })

  test('lê o horário corrido, com e sem a palavra HORARIO', () => {
    expect(
      windowsOf('Obs. Cliente: HORARIO DE RECEBIMENTO DE SEGUNDA A SEXTA DAS 08:00 AS 17:00 HORAS'),
    ).toEqual(every(WEEK, '08:00-17:00'))
    expect(windowsOf('.Obs. Cliente: RECEBIMENTO DE SEGUNDA A SEXTA DAS 08:00 AS 18:00')).toEqual(
      every(WEEK, '08:00-18:00'),
    )
  })

  test('aceita hora sem zero, minutos quebrados e "7:30 as 11hrs"', () => {
    expect(
      windowsOf(
        'Obs. Cliente: RECEBIMENTO DE SEGUNDA A SEXTA DAS 8:00 AS 11:00 E DAS 13:00 AS 17:00',
      ),
    ).toEqual(every(WEEK, '08:00-11:00', '13:00-17:00'))
    expect(
      windowsOf(
        'Obs. Cliente: Recebimento de segunda a sexta das 7:30 as 11hrs e das 12:30hrs as 17:30hrs',
      ),
    ).toEqual(every(WEEK, '07:30-11:00', '12:30-17:30'))
    expect(
      windowsOf(
        'Obs. Cliente: HORARIO DE RECEBIMENTO DE SEGUNDA A SEXTA DAS 08:00 AS 11:15 HORAS E DAS 14:00 AS 17:00 HORAS',
      ),
    ).toEqual(every(WEEK, '08:00-11:15', '14:00-17:00'))
  })

  test('lê as formas abreviadas, sem dia (segunda a sexta é o padrão)', () => {
    expect(windowsOf('Obs. Cliente: RECEBE DAS 9 AS 12 E DAS 14 AS 17HR')).toEqual(
      every(WEEK, '09:00-12:00', '14:00-17:00'),
    )
    expect(windowsOf('Obs. Cliente: RECEBI DAS 8H AS 17HR')).toEqual(every(WEEK, '08:00-17:00'))
    expect(
      windowsOf(
        'Obs. Cliente: HORARIO DE RECEBIMENTO DAS 08:00 AS 11:30 HORAS E DAS 13:00 AS 17:30 HORAS',
      ),
    ).toEqual(every(WEEK, '08:00-11:30', '13:00-17:30'))
  })

  test('lê o formato "08H AS 11H" e não abre o cliente no almoço', () => {
    expect(
      windowsOf(
        'Obs. Cliente: RECEBIMENTO DE SEGUNDA A SEXTA 08H AS 11H E DAS 13H AS 14H - ALMOCO 11H AS 13H',
      ),
    ).toEqual(every(WEEK, '08:00-11:00', '13:00-14:00'))
  })

  test('separa o sábado, que tem horário próprio', () => {
    expect(
      windowsOf(
        'Obs. Cliente: HORARIO DE RECEBIMENTO DE SEGUNDA A SEXTA DAS 07:30 AS 16:00 HORAS, E AOS SABADOS DAS 08:00 AS 10:00 HORAS',
      ),
    ).toEqual(
      [...every(WEEK, '07:30-16:00'), ...every([6], '08:00-10:00')].toSorted(
        (a, b) => Number(a[0]) - Number(b[0]),
      ),
    )
  })

  test('segunda a quinta com "fechado às sextas" deixa a sexta sem janela', () => {
    expect(
      windowsOf(
        '- NroCarga: 41886 .Obs. Cliente: RECEBIMENTO DE SEGUNDA A QUINTA DAS 08:00 AS 11:00 E DAS 13:00 AS 17:00FECHADO AS SEXTAS',
      ),
    ).toEqual(every([1, 2, 3, 4], '08:00-11:00', '13:00-17:00'))
  })

  test('lista de dias salteados', () => {
    expect(
      windowsOf(
        'Obs. Cliente: HORARIO DE RECEBIMENTO DE SEGUNDA, QUARTA E SEXTA DAS 08:00 AS 12:00',
      ),
    ).toEqual(['1 08:00-12:00', '3 08:00-12:00', '5 08:00-12:00'])
  })

  test('"até as 18:20" não diz quando abre: não é janela', () => {
    expect(
      windowsOf(
        'Obs. Cliente: HORARIO DE RECEBIMENTO DE SEGUNDA, QUARTA E SEXTA ATE AS 18:20 HORAS',
      ),
    ).toBeNull()
  })

  test('nota sem horário de recebimento, ou com horário de outra coisa, não vira janela', () => {
    expect(parseReceivingHoursFromNote(null)).toBeNull()
    expect(parseReceivingHoursFromNote('')).toBeNull()
    expect(
      parseReceivingHoursFromNote('LACRE: 1021657 - NroCarga: 41893 B.Calc.ST: 3152.29'),
    ).toBeNull()
    expect(parseReceivingHoursFromNote('Nota emitida das 08:00 AS 17:00 pelo sistema')).toBeNull()
    expect(parseReceivingHoursFromNote('RECEBIMENTO SOMENTE COM AGENDAMENTO')).toBeNull()
  })

  test('intervalo invertido, hora impossível ou faixas que se cruzam não são lidos', () => {
    expect(parseReceivingHoursFromNote('RECEBIMENTO DAS 17:00 AS 08:00')).toBeNull()
    expect(parseReceivingHoursFromNote('RECEBIMENTO DAS 25:00 AS 26:00')).toBeNull()
    expect(
      parseReceivingHoursFromNote('RECEBIMENTO DAS 08:00 AS 12:00 E DAS 11:00 AS 17:00'),
    ).toBeNull()
  })
})

describe('o cliente aparece em várias notas', () => {
  const morning = parseReceivingHoursFromNote('RECEBIMENTO DE SEGUNDA A SEXTA DAS 08:00 AS 12:00')!
  const all = parseReceivingHoursFromNote('RECEBIMENTO DE SEGUNDA A SEXTA DAS 08:00 AS 17:00')!

  test('escolhe a janela mais citada e avisa da divergência', () => {
    const result = consolidateReceivingWindows([all, morning, all])
    expect(result?.windows).toEqual(all)
    expect(result).toMatchObject({ conflicting: true, supportingNotes: 2, totalNotes: 3 })
  })

  test('notas que concordam não geram divergência', () => {
    expect(consolidateReceivingWindows([all, all])).toMatchObject({
      conflicting: false,
      supportingNotes: 2,
    })
    expect(consolidateReceivingWindows([])).toBeNull()
  })
})
