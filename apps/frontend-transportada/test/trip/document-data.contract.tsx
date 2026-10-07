/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 233 T2.1 (RF3/RF4, CA02/CA03) — "Dados da nota": NF-e, Série, Cliente, CNPJ, Valor da carga
 * e Volumes, cada um com o próprio botão de copiar, e o custo e lucro (spec 232) como filho da
 * seção. Cobre o **renderizado** (`renderToStaticMarkup`), nunca texto de fonte para o conteúdo.
 */
import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { TripDocumentData } from '@/modules/trip/components/TripDocumentData.component'
import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import tripPt from '@/modules/trip/locales/trip.locale.json'
import type { TripDocumentDetail } from '@/modules/trip/shared/trip.types'
import { DocumentCostProvider } from '@/modules/trip-financials/components/DocumentCostProvider.component'
import type { TripValuation } from '@/modules/trip-financials/shared/tripValuation.service'

const DOCUMENT_ID = 'document-1'
const NON_BREAKING_SPACE = /\u00a0/gu
const STOP_LIST = new URL(
  '../../src/modules/trip/components/TripStopList.component.tsx',
  import.meta.url,
)

function buildDocument(overrides: Partial<TripDocumentDetail> = {}): TripDocumentDetail {
  return {
    contact: {
      contractorName: null,
      name: 'Mercado Central',
      phone: null,
      taxId: '12345678000195',
    },
    createdAt: '2026-10-01T10:00:00.000Z',
    cteAuthorized: false,
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: 'pending',
    freightCalculationId: null,
    freightRuleName: null,
    id: DOCUMENT_ID,
    loadedAt: null,
    nfeDocumentId: null,
    nfeNumber: '123',
    nfeSeries: '1',
    nfeTotalValue: '1500.0000',
    releasedAt: null,
    returnReason: null,
    returnedAt: null,
    separatedAt: null,
    separationStatus: 'pending',
    stopId: null,
    tripId: 'trip-1',
    updatedAt: '2026-10-01T10:00:00.000Z',
    volumeCount: 12,
    ...overrides,
  }
}

function buildValuation(): TripValuation {
  return {
    costParcels: [],
    hasGaps: false,
    marginPercentage: '54.0000',
    revenueLines: [
      {
        amount: '1000.0000',
        costAmount: '400.0000',
        costBasis: 'leg',
        freightRuleId: null,
        freightRuleName: null,
        gap: null,
        legCostAmount: '300.0000',
        marginAmount: '540.0000',
        marginPercentage: '54.0000',
        nfeDocumentId: null,
        percentage: null,
        source: 'estimated',
        taxAmount: '60.0000',
        timeBasis: 'complete',
        tripDocumentId: DOCUMENT_ID,
        tripShareCostAmount: '100.0000',
      },
    ],
    revenueSource: 'estimated',
    totalCost: '400.0000',
    totalMargin: '600.0000',
    totalRevenue: '1000.0000',
  }
}

function render(
  document: TripDocumentDetail,
  valuation: null | TripValuation = null,
  canOpenClients = false,
): string {
  return renderToStaticMarkup(
    <DocumentCostProvider valuation={valuation}>
      <TripDocumentData canOpenClients={canOpenClients} document={document} />
    </DocumentCostProvider>,
  ).replace(NON_BREAKING_SPACE, ' ')
}

describe('Dados da nota: os campos (spec 233 RF3)', () => {
  it('a série tem rótulo próprio, separada do número', () => {
    const html = render(buildDocument())

    expect(html).toContain('Dados da nota')
    expect(html).toContain('>NF-e<')
    expect(html).toContain('>Série<')
    expect(html).toContain('>123<')
    expect(html).toContain('>1<')
    expect(html).not.toContain('123/1')
  })

  it('imprime o CNPJ formatado', () => {
    const html = render(buildDocument())

    expect(html).toContain('>CNPJ<')
    expect(html).toContain('12.345.678/0001-95')
  })

  /**
   * `formatTaxId` já decide a máscara pelo tamanho (até 11 dígitos é CPF). O rótulo tem de seguir a mesma
   * regra: formatar como CPF e rotular "CNPJ" é uma tela que mente sobre o dado que mostra.
   */
  it('contato pessoa física sai com a máscara e o rótulo de CPF, e o botão diz CPF', () => {
    const html = render(
      buildDocument({
        contact: { contractorName: null, name: 'João da Silva', phone: null, taxId: '12345678909' },
      }),
    )

    expect(html).toContain('>CPF<')
    expect(html).toContain('123.456.789-09')
    expect(html).not.toContain('>CNPJ<')
    expect(html).toContain(`aria-label="${tripPt.documentData.copy.cpf}"`)
    expect(html).not.toContain(`aria-label="${tripPt.documentData.copy.taxId}"`)
  })

  it('sem CNPJ não há campo', () => {
    const html = render(
      buildDocument({
        contact: { contractorName: null, name: 'Mercado Central', phone: null, taxId: '' },
      }),
    )

    expect(html).not.toContain('>CNPJ<')
    expect(html).not.toContain('Copiar CNPJ')
  })

  it('Volumes só aparece com número', () => {
    expect(render(buildDocument())).toContain('>Volumes<')
    expect(render(buildDocument({ volumeCount: 0 }))).toContain('>Volumes<')
    expect(render(buildDocument({ volumeCount: null }))).not.toContain('Volumes')
    // Revisão M5: a API já manda null no fracionário, mas a guarda deixa passar — a tela não imprime "2,5 volumes".
    expect(render(buildDocument({ volumeCount: 2.5 }))).not.toContain('Volumes')
    const withoutVolumeCount: TripDocumentDetail = buildDocument()
    delete (withoutVolumeCount as { volumeCount?: null | number }).volumeCount
    expect(render(withoutVolumeCount)).not.toContain('Volumes')
  })

  it('o valor da carga sai formatado e a série ausente não deixa rótulo', () => {
    const html = render(buildDocument({ nfeSeries: null }))

    expect(html).toContain('R$ 1.500,00')
    expect(html).not.toContain('Série')
  })

  it('sem permissão (valor da carga ausente) nenhum rótulo de dinheiro aparece', () => {
    const html = render(buildDocument({ freightAmount: null, nfeTotalValue: null }))

    expect(html).not.toContain('Valor da carga')
    expect(html).not.toContain('Copiar valor da carga')
    expect(html).not.toContain('R$')
    expect(html).not.toContain('Custo e lucro')
  })

  it('nota sem nenhum dado não imprime a seção', () => {
    const html = render(
      buildDocument({
        contact: null,
        nfeNumber: null,
        nfeSeries: null,
        nfeTotalValue: null,
        volumeCount: null,
      }),
    )

    expect(html).toBe('')
  })
})

describe('Dados da nota: ver cliente (spec 233, link rápido)', () => {
  it('o cliente leva à lista de clientes, pelo href, sem o nome na URL (revisão M4)', () => {
    const html = render(buildDocument(), null, true)

    expect(html).toContain('href="/clientes"')
    expect(html).not.toContain('Mercado+Central')
    expect(html).not.toContain('?name=')
    expect(html).toContain('>Ver cliente<')
    expect(html.split('>Ver cliente<')).toHaveLength(2)
  })

  it('sem cliente não há link', () => {
    const html = render(buildDocument({ contact: null }), null, true)

    expect(html).not.toContain('Ver cliente')
  })

  it('quem não pode abrir /clientes não vê o link (revisão M4)', () => {
    const html = render(buildDocument(), null, false)

    expect(html).not.toContain('Ver cliente')
    expect(html).toContain('Mercado Central')
  })

  it('o link rápido chega ao alvo de toque sob pointer: coarse', () => {
    const css = readFileSync(
      new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url),
      'utf8',
    )
    const coarse = css.match(/@media \(pointer: coarse\) \{[^@]*?\.documentDataLink \{[^}]*\}/u)

    expect(coarse?.[0]).toContain('min-height: var(--touch-target)')
  })
})

describe('Dados da nota: emissão e frete cedidos pelo resumo da linha (revisão de design da 233)', () => {
  it('a nota aberta traz a emissão e o frete previsto, cada um com o seu botão de copiar', () => {
    const html = render(
      buildDocument({
        freightAmount: '620.0000',
        freightSource: 'estimated',
        nfeIssuedAt: '2026-08-10T06:30:00.000Z',
      }),
    )

    expect(html).toContain('>Emissão<')
    expect(html).toContain('>Frete<')
    expect(html).toContain('R$ 620,00')
    expect(html).toContain('(previsto)')
    expect(html).toContain('aria-label="Copiar data de emissão"')
    expect(html).toContain('aria-label="Copiar frete"')
  })

  it('frete medido não ganha "(previsto)", e sem frete ou emissão não sobra rótulo vazio', () => {
    const measured = render(buildDocument({ freightAmount: '620.0000', freightSource: 'measured' }))
    const bare = render(buildDocument({ freightSource: 'missing' }))

    expect(measured).toContain('R$ 620,00')
    expect(measured).not.toContain('(previsto)')
    expect(bare).not.toContain('>Frete<')
    expect(bare).not.toContain('>Emissão<')
  })
})

describe('Dados da nota: copiar (spec 233 D9)', () => {
  it('um botão por campo, com rótulo que diz o que copia', () => {
    const html = render(buildDocument())

    for (const label of [
      'Copiar número da NF-e',
      'Copiar série',
      'Copiar cliente',
      'Copiar CNPJ',
      'Copiar valor da carga',
      'Copiar volumes',
    ]) {
      expect(html.split(`aria-label="${label}"`)).toHaveLength(2)
    }
    expect(html.match(/<button/gu)).toHaveLength(6)
    expect(html).not.toContain('aria-label="Copiar"')
  })

  it('sem Volumes e sem CNPJ há dois botões a menos', () => {
    const html = render(
      buildDocument({
        contact: { contractorName: null, name: 'Mercado Central', phone: null, taxId: '' },
        volumeCount: null,
      }),
    )

    expect(html.match(/<button/gu)).toHaveLength(4)
  })

  it('os rótulos de copiar existem nos dois idiomas', () => {
    for (const locale of [tripPt, tripEn]) {
      expect(Object.keys(locale.documentData.copy).sort()).toEqual([
        'cargoValue',
        'client',
        'cpf',
        'freight',
        'issuedAt',
        'nfeNumber',
        'series',
        'taxId',
        'volumes',
      ])
      expect(locale.documentData.title).toBeString()
      expect(locale.documentData.costTitle).toBeString()
      expect(locale.documentData.volumes).toBeString()
      expect(locale.documentData.copied).toBeString()
    }
  })
})

describe('Dados da nota: custo e lucro dentro da seção (spec 233 RF4, D3)', () => {
  it('o bloco de custo é filho da seção, depois da grade', () => {
    const html = render(buildDocument(), buildValuation())
    const sectionEnd = html.indexOf('</section>')

    expect(html).toContain('Custo e lucro desta nota')
    expect(html.indexOf('Gasto')).toBeGreaterThan(html.indexOf('</dl>'))
    expect(html.indexOf('Gasto')).toBeLessThan(sectionEnd)
    expect(html.indexOf('Lucro')).toBeLessThan(sectionEnd)
  })

  it('o TripStopList não monta mais o custo solto: só a seção, antes do comprovante', () => {
    const source = readFileSync(STOP_LIST, 'utf8')
    const dataAt = source.indexOf('<TripDocumentData')

    expect(source).not.toContain('<TripDocumentCost ')
    expect(source).not.toContain('<TripDocumentCostCriterion')
    expect(dataAt).toBeGreaterThan(-1)
    expect(dataAt).toBeLessThan(source.indexOf('actions.renderProof(document.id)'))
  })
})
