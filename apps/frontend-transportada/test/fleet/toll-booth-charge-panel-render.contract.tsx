/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503 (revisão final, defeito 11): `toll-booth-charge-tab.contract.ts` provava os aceites
 * 2 e 3 (catálogo vazio mostra frase própria; busca sem resultado nomeia a data do catálogo) lendo
 * texto-fonte de `TollBoothChargePanel.component.tsx` — `expect(panel).toContain("catalog.summary.status
 * === 'empty'")` prova só que a string existe no arquivo, nunca o que a tela produz: uma condicional
 * escrita diferente com o mesmo efeito quebraria o teste sem quebrar o comportamento, e uma
 * condicional quebrada com o texto preservado passaria. Este contrato assere sobre o
 * **renderizado** (`renderToStaticMarkup`, i18n real), no molde de
 * `toll-booth-catalog-reload-gate.contract.tsx` — `TollBoothChargePanel` não usa portal nem efeito
 * que dependa de DOM, então renderiza direto, sem jsdom.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import { TollBoothChargePanel } from '@/modules/fleet/components/TollBoothChargePanel.component'
import type { TollBoothCatalogPage } from '@/modules/fleet/shared/tollBoothCatalog.validation'
import fleetLocale from '@/modules/fleet/locales/fleet.locale.json'

const NEVER_LOADED_TEXT = fleetLocale.tollBoothCharges.catalog.status.empty
const NOTHING_TO_FIX_TEXT = fleetLocale.tollBoothCharges.empty

function buildCatalog(overrides: Partial<TollBoothCatalogPage> = {}): TollBoothCatalogPage {
  return {
    data: [],
    pagination: { page: 1, perPage: 20, total: 0 },
    summary: {
      boothCount: 0,
      boothsWithoutAxleChargeCount: 0,
      observedOn: null,
      status: 'empty',
    },
    ...overrides,
  }
}

function renderPanel(
  overrides: Partial<{ catalog: TollBoothCatalogPage; search: string }> = {},
): string {
  return renderToStaticMarkup(
    <TollBoothChargePanel
      catalog={overrides.catalog ?? buildCatalog()}
      disabled={false}
      loading={false}
      saved={false}
      search={overrides.search ?? ''}
      onAdjust={() => {}}
      onClear={() => {}}
      onPageChange={() => {}}
      onSearchChange={() => {}}
    />,
  )
}

describe('TollBoothChargePanel renderizado (spec 154 T503, defeito 11)', () => {
  // Aceite 2: catálogo nunca carregado é ausência de dado, nunca "sem pedágio" — frase própria.
  it('catálogo vazio (status empty) renderiza a frase própria de "nunca carregado"', () => {
    const html = renderPanel({
      catalog: buildCatalog({
        summary: {
          boothCount: 0,
          boothsWithoutAxleChargeCount: 0,
          observedOn: null,
          status: 'empty',
        },
      }),
    })

    expect(html).toContain(NEVER_LOADED_TEXT)
    expect(html).not.toContain(NOTHING_TO_FIX_TEXT)
  })

  it('catálogo com praças (status current) não renderiza a frase de "nunca carregado"', () => {
    const html = renderPanel({
      catalog: buildCatalog({
        data: [
          {
            actorUserId: null,
            catalog: {
              chargeCar: null,
              chargePerAxle: null,
              chargePerAxleAutomatic: null,
              observedOn: '2026-09-14',
            },
            catalogKnown: true,
            chargeCarSource: 'catalog',
            chargePerAxleAutomaticSource: 'catalog',
            chargePerAxleSource: 'catalog',
            effectiveChargeCar: null,
            effectiveChargePerAxle: null,
            effectiveChargePerAxleAutomatic: null,
            name: 'Praça X',
            observedOn: '2026-09-14',
            operator: 'CCR',
            osmNodeId: 1,
            seen: false,
            source: 'catalog',
            updatedAt: null,
          },
        ],
        pagination: { page: 1, perPage: 20, total: 1 },
        summary: {
          boothCount: 1,
          boothsWithoutAxleChargeCount: 1,
          observedOn: '2026-09-14',
          status: 'current',
        },
      }),
    })

    expect(html).not.toContain(NEVER_LOADED_TEXT)
  })

  // Aceite 3: busca sem resultado nunca é indistinguível de "nada a corrigir" — nomeia a data do catálogo.
  it('busca sem resultado (status current, lista vazia) nomeia a data do catálogo, não "nada a corrigir"', () => {
    const html = renderPanel({
      catalog: buildCatalog({
        summary: {
          boothCount: 5,
          boothsWithoutAxleChargeCount: 0,
          observedOn: '2026-09-14',
          status: 'current',
        },
      }),
      search: 'praça que não existe',
    })

    expect(html).not.toContain(NOTHING_TO_FIX_TEXT)
    // A data formatada (14/09/2026) prova que a frase de busca usou `catalog.summary.observedOn`,
    // não a frase genérica de lista vazia sem busca.
    expect(html).toContain('14/09/2026')
  })

  it('lista vazia sem busca (catálogo current, página além do total) mostra "nada a corrigir"', () => {
    const html = renderPanel({
      catalog: buildCatalog({
        pagination: { page: 2, perPage: 20, total: 5 },
        summary: {
          boothCount: 5,
          boothsWithoutAxleChargeCount: 0,
          observedOn: '2026-09-14',
          status: 'current',
        },
      }),
      search: '',
    })

    expect(html).toContain(NOTHING_TO_FIX_TEXT)
  })
})

// Spec 154 T506 (revisão de design): o print do catálogo vazio mostrou a frase de "nunca carregado"
// duas vezes (cabeçalho e corpo), com "0 praças" e "0 pendências" de ruído; e "1 praças" no singular.
describe('TollBoothChargePanel — revisão de design (spec 154 T506)', () => {
  it('catálogo vazio diz "nunca carregado" uma vez só, sem contagens zeradas nem busca', () => {
    const html = renderPanel()

    expect(html.split(NEVER_LOADED_TEXT).length - 1).toBe(1)
    expect(html).not.toContain('type="search"')
    expect(html).not.toContain('0 praças')
  })

  it('uma praça só é contada no singular', () => {
    const html = renderPanel({
      catalog: buildCatalog({
        summary: {
          boothCount: 1,
          boothsWithoutAxleChargeCount: 1,
          observedOn: '2026-09-14',
          status: 'current',
        },
      }),
    })

    expect(html).toContain('1 praça no catálogo.')
    expect(html).toContain('1 praça sem tarifa por eixo conhecida.')
    expect(html).not.toContain('1 praças')
  })
})
