/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import trip from '@/modules/trip/locales/trip.locale.json'
import { TRIP_MANAGE_PERMISSION } from '@/modules/trip/shared/trip.constant'
import {
  resolveOccurrenceCorrectionActions,
  type OccurrenceCorrectionActionsInput,
} from '@/modules/trip/shared/tripOccurrenceDetail.service'
import { TRIP_OCCURRENCE_CASE_STATUSES } from '@/modules/trip/shared/tripOccurrenceFeed.service'

function createTranslate(dictionary: unknown) {
  return (key: string, options?: Record<string, unknown>): string => {
    let value: unknown = dictionary
    for (const part of key.split('.')) {
      value =
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[part]
          : undefined
    }
    if (typeof value !== 'string') throw new Error(`missing locale key: ${key}`)
    return Object.entries(options ?? {}).reduce(
      (text, [name, replacement]) => text.replaceAll(`{{${name}}}`, String(replacement)),
      value,
    )
  }
}

const translate = createTranslate(trip)
const translateEn = createTranslate(tripEn)

const FREE: OccurrenceCorrectionActionsInput = {
  caseView: null,
  hasItems: true,
  isCancelled: false,
  permissions: [TRIP_MANAGE_PERMISSION],
  typeItemsMode: 'optional',
  wasCorrected: false,
}

function withCase(
  status: (typeof TRIP_OCCURRENCE_CASE_STATUSES)[number],
  decisionKind: null | 'goods_paid' | 'other' | 'redelivery_authorized' = null,
): OccurrenceCorrectionActionsInput {
  return {
    ...FREE,
    caseView: {
      decision: decisionKind === null ? null : { kind: decisionKind },
      status,
    },
  }
}

describe('Corrigir e Cancelar: quando agem e o texto de quando não podem (spec 240 RF4, RF10)', () => {
  test('sem tratativa, sem cancelamento e com trip.manage, os dois agem', () => {
    expect(resolveOccurrenceCorrectionActions(FREE, translate)).toEqual({
      cancel: { availability: 'enabled' },
      correct: { availability: 'enabled' },
    })
  })

  test('sem trip.manage nenhum dos dois existe, nem com o motivo', () => {
    const states: readonly OccurrenceCorrectionActionsInput[] = [
      FREE,
      withCase('recorded'),
      { ...FREE, isCancelled: true },
      { ...FREE, hasItems: false, typeItemsMode: 'off' },
    ]
    for (const state of states) {
      expect(
        resolveOccurrenceCorrectionActions({ ...state, permissions: ['trip.read'] }, translate),
      ).toEqual({ cancel: { availability: 'hidden' }, correct: { availability: 'hidden' } })
    }
  })

  test('tipo off e sem itens: Corrigir não existe, Cancelar continua', () => {
    expect(
      resolveOccurrenceCorrectionActions(
        { ...FREE, hasItems: false, typeItemsMode: 'off' },
        translate,
      ),
    ).toEqual({
      cancel: { availability: 'enabled' },
      correct: { availability: 'hidden' },
    })
  })

  test('sem itens, mas já corrigida (nota inteira escolhida na correção): Corrigir continua', () => {
    expect(
      resolveOccurrenceCorrectionActions(
        { ...FREE, hasItems: false, typeItemsMode: 'off', wasCorrected: true },
        translate,
      ),
    ).toEqual({
      cancel: { availability: 'enabled' },
      correct: { availability: 'enabled' },
    })
  })

  test('com itens, Corrigir existe haja ou não correção antes', () => {
    for (const wasCorrected of [false, true]) {
      expect(
        resolveOccurrenceCorrectionActions({ ...FREE, hasItems: true, wasCorrected }, translate)
          .correct,
      ).toEqual({ availability: 'enabled' })
    }
  })

  /** Spec 241 RF7/CA05: o tipo decide; os itens gravados e a correção são só o resto de antes. */
  describe('Corrigir por tipo (spec 241 CA05)', () => {
    const TABLE: readonly (readonly [
      string,
      OccurrenceCorrectionActionsInput['typeItemsMode'],
      boolean,
      boolean,
      boolean,
    ])[] = [
      [
        'optional, sem itens, nunca corrigida (a avaria da nota inteira)',
        'optional',
        false,
        false,
        true,
      ],
      ['optional, com itens', 'optional', true, false, true],
      ['required, sem itens', 'required', false, false, true],
      ['off, sem itens, nunca corrigida (a prorrogação)', 'off', false, false, false],
      ['off, com itens gravados antes de o tipo virar off', 'off', true, false, true],
      ['off, já corrigida', 'off', false, true, true],
      ['off, com itens e já corrigida', 'off', true, true, true],
    ]

    for (const [label, typeItemsMode, hasItems, wasCorrected, isShown] of TABLE) {
      test(`${label}: Corrigir ${isShown ? 'aparece' : 'some'} e Cancelar continua`, () => {
        const actions = resolveOccurrenceCorrectionActions(
          { ...FREE, hasItems, typeItemsMode, wasCorrected },
          translate,
        )
        expect(actions.correct.availability).toBe(isShown ? 'enabled' : 'hidden')
        expect(actions.cancel.availability).toBe('enabled')
      })
    }
  })

  test('sem itens e com tratativa aberta: Corrigir segue ausente e Cancelar explica', () => {
    const actions = resolveOccurrenceCorrectionActions(
      { ...withCase('under_review'), hasItems: false, typeItemsMode: 'off' },
      translate,
    )
    expect(actions.correct).toEqual({ availability: 'hidden' })
    expect(actions.cancel.availability).toBe('disabled')
  })

  describe('o motivo desabilitado, em texto, por estado', () => {
    const REASONS = {
      caseCancelled:
        'A tratativa foi cancelada; a ocorrência segue com o histórico dela e já não pode ser corrigida nem cancelada.',
      caseClosed:
        'A tratativa foi fechada; a ocorrência virou histórico e já não pode ser corrigida nem cancelada.',
      caseDecidedGoodsPaid:
        'A tratativa foi decidida com mercadoria paga; o acerto nasce desta ocorrência e ela já não pode ser corrigida nem cancelada.',
      caseDecidedOther:
        'A tratativa foi decidida por outro caminho, com nota do escritório; a ocorrência já não pode ser corrigida nem cancelada.',
      caseDecidedRedelivery:
        'A tratativa foi decidida com reentrega autorizada; a reentrega parte desta ocorrência e ela já não pode ser corrigida nem cancelada.',
      caseOpen:
        'A tratativa está aberta: depois que ela abre, a ocorrência já vale dinheiro e não pode mais ser corrigida nem cancelada.',
      caseReturnedToWarehouse:
        'A mercadoria já voltou ao barracão por esta tratativa; a ocorrência já não pode ser corrigida nem cancelada.',
      occurrenceCancelled:
        'Esta ocorrência já foi cancelada e não pode mais ser corrigida nem cancelada.',
    } as const

    const CASES: readonly (readonly [string, OccurrenceCorrectionActionsInput, string])[] = [
      ['tratativa registrada', withCase('recorded'), REASONS.caseOpen],
      ['tratativa em análise', withCase('under_review'), REASONS.caseOpen],
      ['tratativa aguardando o contratante', withCase('awaiting_contractor'), REASONS.caseOpen],
      [
        'decidida com reentrega',
        withCase('decided', 'redelivery_authorized'),
        REASONS.caseDecidedRedelivery,
      ],
      [
        'decidida com mercadoria paga',
        withCase('decided', 'goods_paid'),
        REASONS.caseDecidedGoodsPaid,
      ],
      ['decidida de outro jeito', withCase('decided', 'other'), REASONS.caseDecidedOther],
      ['fechada', withCase('closed', 'goods_paid'), REASONS.caseClosed],
      ['devolvida ao barracão', withCase('returned_to_warehouse'), REASONS.caseReturnedToWarehouse],
      ['tratativa cancelada', withCase('cancelled'), REASONS.caseCancelled],
      ['ocorrência cancelada', { ...FREE, isCancelled: true }, REASONS.occurrenceCancelled],
    ]

    for (const [label, input, reason] of CASES) {
      test(`${label}: os dois botões desabilitados com o texto exato`, () => {
        expect(resolveOccurrenceCorrectionActions(input, translate)).toEqual({
          cancel: { availability: 'disabled', reason },
          correct: { availability: 'disabled', reason },
        })
      })
    }

    test('ocorrência cancelada vale antes da tratativa, como no servidor', () => {
      const actions = resolveOccurrenceCorrectionActions(
        { ...withCase('under_review'), isCancelled: true },
        translate,
      )
      expect(actions.correct).toEqual({
        availability: 'disabled',
        reason: REASONS.occurrenceCancelled,
      })
    })

    test('cada estado da tratativa tem um texto, e nenhum cai no do vizinho por engano', () => {
      const texts = TRIP_OCCURRENCE_CASE_STATUSES.map((status) => {
        const actions = resolveOccurrenceCorrectionActions(
          withCase(status, status === 'decided' ? 'other' : null),
          translate,
        )
        if (actions.cancel.availability !== 'disabled') throw new Error('CASE_MUST_BLOCK')
        return actions.cancel.reason
      })
      expect(new Set(texts).size).toBe(5)
      expect(texts.every((text) => text !== '')).toBe(true)
    })

    test('em inglês, o texto existe para todos os estados e difere do português', () => {
      for (const [, input, reason] of CASES) {
        const actions = resolveOccurrenceCorrectionActions(input, translateEn)
        if (actions.cancel.availability !== 'disabled') throw new Error('CASE_MUST_BLOCK')
        expect(actions.cancel.reason).not.toBe('')
        expect(actions.cancel.reason).not.toBe(reason)
      }
    })
  })
})
