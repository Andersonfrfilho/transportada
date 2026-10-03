/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceCorrectionActions } from '@/modules/trip/components/OccurrenceCorrectionActions.component'
import { TRIP_MANAGE_PERMISSION } from '@/modules/trip/shared/trip.constant'
import type { TripOccurrenceDetail } from '@/modules/trip/shared/tripOccurrenceFeed.service'

import { buildOccurrenceDetailFixture } from '../fixtures/tripOccurrenceDetail.fixture'

const CASE_OPEN_REASON =
  'A tratativa está aberta: depois que ela abre, a ocorrência já vale dinheiro e não pode mais ser corrigida nem cancelada.'
const CANCELLED_REASON =
  'Esta ocorrência já foi cancelada e não pode mais ser corrigida nem cancelada.'

function render(
  occurrence: TripOccurrenceDetail,
  permissions: readonly string[] = [TRIP_MANAGE_PERMISSION],
): string {
  return renderToStaticMarkup(
    <OccurrenceCorrectionActions occurrence={occurrence} permissions={permissions} />,
  )
}

function withOpenCase(): TripOccurrenceDetail {
  return buildOccurrenceDetailFixture({
    case: {
      decision: null,
      redeliveryPolicy: 'allowed',
      settlementTotal: null,
      status: 'under_review',
      updatedAt: '2026-10-01T11:00:00.000Z',
    },
  })
}

function readReasonText(markup: string): null | string {
  const describedBy = /aria-describedby="([^"]+)"/u.exec(markup)?.[1]
  if (describedBy === undefined) return null
  const reason = new RegExp(`id="${describedBy}"[^>]*>([^<]*)<`, 'u').exec(markup)
  return reason?.[1] ?? null
}

describe('botão Corrigir no detalhe da ocorrência (spec 235 T2.1)', () => {
  test('CA02: sem trip.manage não existe botão nenhum na árvore', () => {
    const markup = render(buildOccurrenceDetailFixture(), ['fleet.read'])
    expect(markup).toBe('')
  })

  test('com trip.manage e a janela aberta, Corrigir está habilitado e sem motivo', () => {
    const markup = render(buildOccurrenceDetailFixture())
    expect(markup).toContain('Corrigir')
    expect(markup).toContain('aria-disabled="false"')
    expect(markup).not.toContain('aria-describedby')
  })

  test('CA03: com tratativa, o botão segue no foco e o motivo em texto vai ligado a ele', () => {
    const markup = render(withOpenCase())
    expect(markup).toContain('aria-disabled="true"')
    expect(markup).not.toMatch(/<button[^>]*\sdisabled/u)
    expect(readReasonText(markup)).toBe(CASE_OPEN_REASON)
  })

  test('CA03: ocorrência cancelada desabilita com o texto da cancelada, que vence a tratativa', () => {
    const markup = render({
      ...withOpenCase(),
      cancellation: {
        cancelledAt: '2026-10-02T10:00:00.000Z',
        cancelledByName: 'Operador de teste',
        reason: 'Lançada na nota errada',
      },
    })
    expect(readReasonText(markup)).toBe(CANCELLED_REASON)
  })

  test('ocorrência sem itens não tem Corrigir (RF10), mesmo com permissão e janela aberta', () => {
    const markup = render(buildOccurrenceDetailFixture({ items: [] }))
    expect(markup).not.toContain('Corrigir')
    expect(markup).toContain('Cancelar ocorrência')
  })

  test('ocorrência de parada não tem Corrigir: as rotas da 167 são da ocorrência de nota', () => {
    expect(render(buildOccurrenceDetailFixture({ source: 'stop' }))).toBe('')
  })

  test('sem trip.manage o Cancelar também não existe (CA02)', () => {
    expect(render(buildOccurrenceDetailFixture({ items: [] }), ['fleet.read'])).toBe('')
  })

  test('CA03: com tratativa, Cancelar fica aria-disabled e leva o mesmo motivo em texto', () => {
    const markup = render(withOpenCase())
    expect(markup.match(/aria-disabled="true"/gu)).toHaveLength(2)
    expect(markup).toContain('Cancelar ocorrência')
    expect(markup).toContain(CASE_OPEN_REASON)
  })
})
