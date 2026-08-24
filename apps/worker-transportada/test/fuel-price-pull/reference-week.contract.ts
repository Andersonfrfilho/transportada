/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A ANP publica o resumo de uma semana **depois** de a semana fechar. Pedir a semana que contém hoje
 * — em qualquer dia — é pedir arquivo que ainda não existe. Medido em 16/08/2026: a semana corrente
 * devolve 404 e as três anteriores devolvem 200.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildWeeklyWorkbookPath,
  resolveReferenceWeek,
} from '../../src/fuel-price-pull/domain/reference-week.policy.js'

const LAST_COMPLETED_WEEK = { endingOn: '2026-08-15', startingOn: '2026-08-09' } as const

describe('ANP reference week', () => {
  test('resolves to the last completed week, never the one in progress', () => {
    expect(resolveReferenceWeek({ today: new Date('2026-08-16T09:00:00Z') })).toEqual(
      LAST_COMPLETED_WEEK,
    )
  })

  test('on a Saturday it does not ask for the week ending that same day', () => {
    const week = resolveReferenceWeek({ today: new Date('2026-08-22T09:00:00Z') })

    expect(week.endingOn).not.toBe('2026-08-22')
    expect(week).toEqual(LAST_COMPLETED_WEEK)
  })

  test('every weekday of the same week resolves to the same file', () => {
    const days = [
      '2026-08-16T00:00:00Z',
      '2026-08-17T23:59:59Z',
      '2026-08-19T12:00:00Z',
      '2026-08-21T06:00:00Z',
      '2026-08-22T23:59:59Z',
    ]

    for (const day of days) {
      expect(resolveReferenceWeek({ today: new Date(day) })).toEqual(LAST_COMPLETED_WEEK)
    }
  })

  test('the week always runs Sunday to Saturday and spans seven days', () => {
    const week = resolveReferenceWeek({ today: new Date('2026-08-19T12:00:00Z') })

    expect(new Date(`${week.startingOn}T00:00:00Z`).getUTCDay()).toBe(0)
    expect(new Date(`${week.endingOn}T00:00:00Z`).getUTCDay()).toBe(6)
  })

  test('the resolved week is always strictly in the past', () => {
    const today = new Date('2026-08-19T12:00:00Z')
    const week = resolveReferenceWeek({ today })

    expect(new Date(`${week.endingOn}T23:59:59Z`).getTime()).toBeLessThan(today.getTime())
  })

  test('builds the workbook path from the resolved week', () => {
    expect(buildWeeklyWorkbookPath(LAST_COMPLETED_WEEK)).toBe(
      'arquivos-lpc/2026/resumo_semanal_lpc_2026-08-09_2026-08-15.xlsx',
    )
  })

  test('takes the year from the week that starts it, across the turn of the year', () => {
    const week = resolveReferenceWeek({ today: new Date('2027-01-01T09:00:00Z') })

    expect(week).toEqual({ endingOn: '2026-12-26', startingOn: '2026-12-20' })
    expect(buildWeeklyWorkbookPath(week)).toContain('arquivos-lpc/2026/')
  })
})
