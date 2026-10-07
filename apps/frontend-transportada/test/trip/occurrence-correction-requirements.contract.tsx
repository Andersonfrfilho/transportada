/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceCorrectionAmounts } from '@/modules/trip/components/OccurrenceCorrectionAmounts.component'
import { EMPTY_CORRECTION_AMOUNTS_DRAFT } from '@/modules/trip/shared/occurrenceCorrectionAmounts.service'
import {
  GENERIC_RECORD_CONFIG,
  selectRecordConfig,
  type OccurrenceTypeRecordConfig,
} from '@/modules/trip/shared/occurrenceRecordConfig.service'
import { EMPTY_CORRECTION_RECORDED_AMOUNTS } from '@/modules/trip/shared/occurrenceRecordedAmounts.service'
import type { TripOccurrenceRequirements } from '@/modules/trip/shared/tripOccurrenceFeed.service'

const REQUIREMENTS: TripOccurrenceRequirements = {
  declaredAmountLabel: 'Valor pago pela loja',
  declaredAmountMode: 'optional',
  declaredAmountScope: 'item',
  itemsMode: 'required',
  referenceNumberLabel: 'Número da NFD',
  referenceNumberMode: 'optional',
}

const SELECTION = { codes: ['696'], products: [], quantitiesByCode: new Map() }

function render(
  typeConfig: OccurrenceTypeRecordConfig,
  recorded = EMPTY_CORRECTION_RECORDED_AMOUNTS,
): string {
  return renderToStaticMarkup(
    <OccurrenceCorrectionAmounts
      draft={EMPTY_CORRECTION_AMOUNTS_DRAFT}
      onChange={() => undefined}
      recorded={recorded}
      selection={SELECTION}
      typeConfig={typeConfig}
    />,
  )
}

function fromRequirements(overrides: Partial<TripOccurrenceRequirements>) {
  return selectRecordConfig({
    fallback: GENERIC_RECORD_CONFIG,
    requirements: { ...REQUIREMENTS, ...overrides },
  })
}

describe('a correção segue o requisito efetivo do tipo (spec 247 T7.2b, N1/N2)', () => {
  test('operador sem settings.manage: o rótulo e o nível vêm de requirements, não do genérico', () => {
    const markup = render(fromRequirements({ declaredAmountScope: 'occurrence' }))
    expect(markup).toContain('Número da NFD')
    expect(markup).toContain('Valor pago pela loja (da ocorrência)')
    expect(markup).not.toContain('Número do documento do cliente')
  })

  test('escopo por linha com nada gravado: um campo por produto, com o rótulo do tipo', () => {
    const markup = render(fromRequirements({}))
    expect(markup).toContain('696 — Valor pago pela loja')
  })

  test('sem requirements o genérico segue como sempre', () => {
    const markup = render(
      selectRecordConfig({ fallback: GENERIC_RECORD_CONFIG, requirements: null }),
    )
    expect(markup).toContain('Número do documento do cliente')
    expect(markup).toContain('696 — Valor pago')
  })

  test('modo off: o campo não existe, nem o valor pago nem o número', () => {
    const markup = render(
      fromRequirements({ declaredAmountMode: 'off', referenceNumberMode: 'off' }),
    )
    expect(markup).not.toContain('Número da NFD')
    expect(markup).not.toContain('Valor pago pela loja')
    expect(markup).not.toContain('<input')
    expect(markup).not.toContain('Valor que vai no e-mail')
  })

  test('modo off só no número: o valor pago continua', () => {
    const markup = render(fromRequirements({ referenceNumberMode: 'off' }))
    expect(markup).not.toContain('Número da NFD')
    expect(markup).toContain('696 — Valor pago pela loja')
  })

  test('modo required: sem "Limpar" e com o texto de obrigatório, mesmo com valor gravado', () => {
    const recorded = {
      declaredAmount: null,
      lineAmounts: new Map([['696', '50.00']]),
      referenceNumber: 'NFD 45029',
    }
    const required = render(
      fromRequirements({ declaredAmountMode: 'required', referenceNumberMode: 'required' }),
      recorded,
    )
    expect(required).not.toContain('aria-label="Limpar')
    expect(required.match(/Obrigatório: este campo não pode ficar vazio\./gu)).toHaveLength(2)
    expect(render(fromRequirements({}), recorded)).toContain('aria-label="Limpar')
  })
})
