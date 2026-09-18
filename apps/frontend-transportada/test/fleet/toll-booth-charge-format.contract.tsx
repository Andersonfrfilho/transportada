/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T507, item 1: a tarifa da aba de pedágio mostra as casas que o número **tem** — no mínimo
 * duas, no máximo quatro, sem zero à direita além da segunda. Arredondar para duas esconderia o
 * valor com tag (14,70 × 0,95 = 13,965) que o operador confere; quatro fixas davam "R$ 14,7000"
 * ao lado dos "R$ 16,40" do resumo da rota. O campo de edição não muda.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import { TollBoothChargeRow } from '@/modules/fleet/components/TollBoothChargeRow.component'
import { formatChargeOrUnknown } from '@/modules/fleet/shared/tollBoothChargeFormat.service'
import type { TollBoothCatalogEntry } from '@/modules/fleet/shared/tollBoothCatalog.validation'

const UNKNOWN_LABEL = 'desconhecida'
const NBSP = ' '

function buildEntry(): TollBoothCatalogEntry {
  return {
    actorUserId: null,
    catalog: {
      chargeCar: '9.8000',
      chargePerAxle: '14.7000',
      chargePerAxleAutomatic: '13.9650',
      observedOn: '2026-09-14',
    },
    catalogKnown: true,
    chargeCarSource: 'catalog',
    chargePerAxleAutomaticSource: 'catalog',
    chargePerAxleSource: 'catalog',
    effectiveChargeCar: '9.8000',
    effectiveChargePerAxle: '14.7000',
    effectiveChargePerAxleAutomatic: '13.9650',
    name: 'Praça Batatais',
    observedOn: '2026-09-14',
    operator: 'Arteris ViaPaulista',
    osmNodeId: 101,
    seen: true,
    source: 'catalog',
    updatedAt: null,
  }
}

describe('tarifa de pedágio com as casas que o número tem (spec 154 T507, item 1)', () => {
  it.each([
    ['14.7000', `R$${NBSP}14,70`],
    ['13.9650', `R$${NBSP}13,965`],
    ['4.2', `R$${NBSP}4,20`],
    ['0.1234', `R$${NBSP}0,1234`],
  ])('%s vira %s', (value, expected) => {
    expect(formatChargeOrUnknown(value, UNKNOWN_LABEL)).toBe(expected)
  })

  it('tarifa ausente continua com o rótulo de desconhecida', () => {
    expect(formatChargeOrUnknown(null, UNKNOWN_LABEL)).toBe(UNKNOWN_LABEL)
  })

  it('a linha da praça renderiza "R$ 14,70" e "R$ 13,965", nunca "14,7000"', () => {
    const html = renderToStaticMarkup(
      <TollBoothChargeRow
        disabled={false}
        entry={buildEntry()}
        onAdjust={() => {}}
        onClear={() => {}}
      />,
    )

    expect(html).toContain(`R$${NBSP}14,70`)
    expect(html).toContain(`R$${NBSP}13,965`)
    expect(html).not.toContain('14,7000')
    expect(html).not.toContain('13,9650')
  })
})
