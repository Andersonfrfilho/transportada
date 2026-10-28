/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.3 (ADR-0110 §5, D5): o HTML do sistema — logo por `cid:` ou iniciais, tabela de itens com teto,
 * marcas do rodapé por `APP_BASE_URL` e a faixa de resposta — e o `APP_BASE_URL` opcional do ambiente.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { OCCURRENCE_ITEM_LINES_LIMIT } from '../../src/occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import {
  buildOccurrenceMailSystemHtml,
  type OccurrenceMailItemRow,
} from '../../src/occurrence-conversation/domain/occurrence-mail-system-html.policy.js'
import { buildOccurrenceItemRows } from '../../src/trips/domain/occurrence-mail-values.policy.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

const NO_ROWS: readonly OccurrenceMailItemRow[] = []

function rows(count: number): readonly OccurrenceMailItemRow[] {
  return Array.from({ length: count }, (_, index) => ({
    amount: 'R$ 57,20',
    code: `70${String(index).padStart(5, '0')} 01`,
    description: 'PRODUTO EXEMPLO A 500G',
    quantity: '1 FD',
  }))
}

function build(overrides: Partial<Parameters<typeof buildOccurrenceMailSystemHtml>[0]> = {}) {
  return buildOccurrenceMailSystemHtml({
    appBaseUrl: undefined,
    displayName: 'Alfa Transportes',
    hasLogo: false,
    hasReplyTo: false,
    itemRows: NO_ROWS,
    itemsSum: '',
    signerInitials: 'AB',
    signerIsTeam: false,
    ...overrides,
  })
}

describe('spec 272 D5: logoTransportadora', () => {
  test('com logo: <img> por cid, com o nome de exibição escapado no alt', () => {
    const { hasInlineLogo, systemHtml } = build({ displayName: 'A&B "C"', hasLogo: true })

    expect(hasInlineLogo).toBe(true)
    expect(systemHtml.logoTransportadora).toContain('<img src="cid:company-logo"')
    expect(systemHtml.logoTransportadora).toContain('alt="A&amp;B &quot;C&quot;"')
    expect(systemHtml.logoTransportadora).toContain('width="48" height="48"')
  })

  test('sem logo: quadrado de tabela com as iniciais (marcação do nome não vira iniciais), sem <img> e sem logo embutido', () => {
    const { hasInlineLogo, systemHtml } = build({ displayName: '<b>Alfa</b> Transportes' })

    expect(hasInlineLogo).toBe(false)
    expect(systemHtml.logoTransportadora).not.toContain('<img')
    expect(systemHtml.logoTransportadora).not.toContain('cid:')
    expect(systemHtml.logoTransportadora).toContain('<table')
    expect(systemHtml.logoTransportadora).not.toContain('<b>')
    expect(systemHtml.logoTransportadora).toContain('>T<')
  })

  test('sem logo e iniciais simples', () => {
    expect(build().systemHtml.logoTransportadora).toContain('>AT<')
  })
})

describe('spec 272 D5: tabelaItens', () => {
  test('sem itens: vazia', () => {
    expect(build().systemHtml.tabelaItens).toBe('')
  })

  test('cabeçalho Código / Item / Qtd. / Valor, as linhas e o total dos itens', () => {
    const { systemHtml } = build({ itemRows: rows(2), itemsSum: '114,40' })

    for (const heading of ['Código', 'Item', 'Qtd.', 'Valor']) {
      expect(systemHtml.tabelaItens).toContain(`>${heading}<`)
    }
    expect(systemHtml.tabelaItens).toContain('7000000 01')
    expect(systemHtml.tabelaItens).toContain('PRODUTO EXEMPLO A 500G')
    expect(systemHtml.tabelaItens).toContain('Total dos itens')
    expect(systemHtml.tabelaItens).toContain('R$ 114,40')
    expect(systemHtml.tabelaItens).not.toContain('e mais')
  })

  test('sem soma: a linha de total não aparece', () => {
    expect(build({ itemRows: rows(1) }).systemHtml.tabelaItens).not.toContain('Total dos itens')
  })

  test('200 itens cabem em menos de 100 KB e não ganham "e mais"', () => {
    const { systemHtml } = build({
      itemRows: rows(OCCURRENCE_ITEM_LINES_LIMIT),
      itemsSum: '11.440,00',
    })

    expect(Buffer.byteLength(systemHtml.tabelaItens, 'utf8')).toBeLessThan(100 * 1024)
    expect(systemHtml.tabelaItens).not.toContain('e mais')
    expect(systemHtml.tabelaItens).toContain('7000199 01')
  })

  test('201 itens: 200 linhas e "e mais 1 item" (singular)', () => {
    const { systemHtml } = build({ itemRows: rows(201), itemsSum: '11.497,20' })

    expect(systemHtml.tabelaItens).toContain('e mais 1 item<')
    expect(systemHtml.tabelaItens).not.toContain('e mais 1 itens')
    expect(systemHtml.tabelaItens).toContain('7000199 01')
    expect(systemHtml.tabelaItens).not.toContain('7000200 01')
  })

  test('250 itens: "e mais 50 itens" (plural)', () => {
    expect(build({ itemRows: rows(250) }).systemHtml.tabelaItens).toContain('e mais 50 itens<')
  })

  test('escapa código, item, quantidade, valor e soma', () => {
    const { systemHtml } = build({
      itemRows: [
        {
          amount: 'R$ <1>',
          code: '<c>',
          description: '<img src=x onerror=1> & "x"',
          quantity: '<q>',
        },
      ],
      itemsSum: '<s>',
    })

    expect(systemHtml.tabelaItens).not.toContain('<img')
    expect(systemHtml.tabelaItens).not.toContain('<c>')
    expect(systemHtml.tabelaItens).not.toContain('<q>')
    expect(systemHtml.tabelaItens).not.toContain('<s>')
    expect(systemHtml.tabelaItens).toContain('&lt;img src=x onerror=1&gt; &amp; &quot;x&quot;')
  })
})

const plain = (html: string): string => html.replace(/<[^>]+>/gu, '')

describe('imagens por endereço público', () => {
  const LOGO = 'https://api.example.test/public/mail-assets/c1/logo'
  const PHOTO = 'https://api.example.test/public/mail-assets/c1/users/u1/picture'

  test('com endereço, o logo vai por src e não há parte inline', () => {
    const { hasInlineLogo, systemHtml } = build({ hasLogo: true, logoUrl: LOGO })

    expect(hasInlineLogo).toBe(false)
    expect(systemHtml.logoTransportadora).toContain(`src="${LOGO}"`)
    expect(systemHtml.logoTransportadora).not.toContain('cid:')
  })

  test('assinatura de pessoa com foto: a foto; sem foto: as iniciais', () => {
    expect(
      build({ hasLogo: true, logoUrl: LOGO, signerPictureUrl: PHOTO }).systemHtml.logoAssinatura,
    ).toContain(`src="${PHOTO}"`)
    expect(build({ hasLogo: true, logoUrl: LOGO }).systemHtml.logoAssinatura).toBe('AB')
  })

  test('assinatura da equipe: o logo por endereço', () => {
    expect(
      build({ hasLogo: true, logoUrl: LOGO, signerIsTeam: true }).systemHtml.logoAssinatura,
    ).toContain(`src="${LOGO}"`)
  })

  test('o endereço é escapado', () => {
    expect(
      build({ hasLogo: true, logoUrl: 'https://a.test/"x' }).systemHtml.logoTransportadora,
    ).not.toContain('"x')
  })
})

describe('logoAssinatura', () => {
  test('equipe com logo: o logo por cid no quadrado da assinatura', () => {
    const { logoAssinatura } = build({ hasLogo: true, signerIsTeam: true }).systemHtml

    expect(logoAssinatura).toContain('src="cid:company-logo"')
  })

  test('pessoa assina, ou sem logo: as iniciais escapadas', () => {
    expect(build({ hasLogo: true, signerInitials: 'A&B' }).systemHtml.logoAssinatura).toBe(
      'A&amp;B',
    )
    expect(build({ signerInitials: 'AB', signerIsTeam: true }).systemHtml.logoAssinatura).toBe('AB')
  })
})

describe('spec 272 D5: marcasRodape', () => {
  test('cada miniatura fica ao lado do nome que identifica, na ordem do desenho', () => {
    const { marcasRodape } = build({ appBaseUrl: 'https://app.example.test' }).systemHtml
    const product = marcasRodape.indexOf('icon-192.png')
    const platform = marcasRodape.indexOf('ada-technology.png')

    expect(product).toBeLessThan(marcasRodape.indexOf('TransportAdA'))
    expect(marcasRodape.indexOf('TransportAdA')).toBeLessThan(platform)
    expect(platform).toBeLessThan(marcasRodape.indexOf('Ada Technology'))
    expect(marcasRodape).not.toContain('margin:0 auto')
  })

  const SIGNATURE = 'Enviado pelo TransportAdA — uma solução Ada Technology'

  test('com APP_BASE_URL: as duas marcas por URL absoluta (barra final aparada) e o texto', () => {
    const { marcasRodape } = build({ appBaseUrl: 'https://app.example.test/' }).systemHtml

    expect(marcasRodape).toContain('src="https://app.example.test/icons/icon-192.png"')
    expect(marcasRodape).toContain('src="https://app.example.test/icons/ada-technology.png"')
    expect(plain(marcasRodape)).toBe(SIGNATURE)
  })

  test('sem APP_BASE_URL: só o texto, nenhuma imagem', () => {
    const { marcasRodape } = build().systemHtml

    expect(plain(marcasRodape)).toBe(SIGNATURE)
    expect(marcasRodape).not.toContain('<img')
  })

  test('origem que não é http(s) não vira src', () => {
    const { marcasRodape } = build({ appBaseUrl: 'javascript:alert(1)' }).systemHtml

    expect(marcasRodape).not.toContain('<img')
    expect(marcasRodape).not.toContain('javascript')
  })

  test('aspas na origem saem escapadas', () => {
    const { marcasRodape } = build({ appBaseUrl: 'https://a.example.test/"x' }).systemHtml

    expect(marcasRodape).not.toContain('"x')
    expect(marcasRodape).toContain('&quot;x')
  })
})

describe('spec 272 D5/D15: faixaResposta', () => {
  test('só com Reply-To', () => {
    expect(build({ hasReplyTo: true }).systemHtml.faixaResposta).toContain(
      '↩ Responda este e-mail: a resposta entra na conversa desta ocorrência e chega à equipe.',
    )
    expect(build({ hasReplyTo: false }).systemHtml.faixaResposta).toBe('')
  })

  test('as seis chaves do conjunto fechado, e só elas', () => {
    expect(Object.keys(build().systemHtml).sort()).toEqual([
      'avisoNovaData',
      'faixaResposta',
      'logoAssinatura',
      'logoTransportadora',
      'marcasRodape',
      'tabelaItens',
    ])
  })
})

describe('spec 272 D5: as linhas da tabela vêm dos mesmos números do texto', () => {
  test('buildOccurrenceItemRows: quantidade com unidade, valor em R$ e a soma da 247', () => {
    const result = buildOccurrenceItemRows({
      contractorName: 'C',
      documentLabel: '1/1',
      driverName: 'M',
      itemCode: '',
      itemLabel: '',
      itemQuantity: '',
      lines: [
        {
          code: '7000001 01',
          declaredAmount: null,
          description: 'PRODUTO EXEMPLO A 500G',
          nfeQuantity: '2.0000',
          quantity: '1.0000',
          totalValue: '114.40',
          unit: 'FD',
          unitValue: '57.20',
        },
      ],
      note: '',
      occurredOn: '01/01/2026',
      recipientName: 'R',
      stopLabel: 'P',
      totalValue: '100.00',
    })

    expect(result).toEqual({
      itemsSum: '57,20',
      rows: [
        {
          amount: 'R$ 57,20',
          code: '7000001 01',
          description: 'PRODUTO EXEMPLO A 500G',
          quantity: '1 FD',
        },
      ],
    })
  })
})

describe('spec 272 D5: APP_BASE_URL no ambiente da API', () => {
  test('opcional: ausente ou vazio é undefined', () => {
    expect(parseEnvironment(API_ENVIRONMENT).appBaseUrl).toBeUndefined()
    expect(parseEnvironment({ ...API_ENVIRONMENT, APP_BASE_URL: '' }).appBaseUrl).toBeUndefined()
  })

  test('preenchido: a origem do painel', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, APP_BASE_URL: 'https://app.example.test' }).appBaseUrl,
    ).toBe('https://app.example.test')
  })

  test('preenchido e torto derruba o boot', () => {
    expect(() => parseEnvironment({ ...API_ENVIRONMENT, APP_BASE_URL: 'não é url' })).toThrow()
  })
})
