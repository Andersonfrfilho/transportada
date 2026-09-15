/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildAddressCorrectionMail } from '../../src/address-correction/domain/address-correction-mail.template.js'
import type { AddressFields } from '../../src/address-correction/application/address-correction.port.js'
import type { AddressCorrectionMailItem } from '../../src/address-correction/domain/address-correction-mail.types.js'
import { ADDRESS_CORRECTION_MAIL_COLOR } from '../../src/address-correction/domain/address-correction-mail.constant.js'
import { MAIL_TEMPLATE_CATALOG } from '../../src/contractor-mail/domain/mail-template-catalog.constant.js'

const SUGGESTED = MAIL_TEMPLATE_CATALOG.address_correction.suggestedTemplate
const DEFAULT_TEMPLATE = {
  closing: SUGGESTED.closing,
  intro: SUGGESTED.intro,
  itemText: SUGGESTED.itemText,
  subject: SUGGESTED.subject,
}

const REPORTED: AddressFields = {
  city: 'ITIRAPINA',
  cityCode: '3523909',
  complement: null,
  district: 'CENTRO',
  number: '1209',
  postalCode: '13530000',
  state: 'SP',
  street: 'RUA 3',
}

const PROPOSED: AddressFields = {
  city: 'Itirapina',
  cityCode: '3523909',
  complement: null,
  district: 'Jardim Nova Itirapina',
  number: '1209',
  postalCode: '13530000',
  state: 'SP',
  street: 'Rua Três',
}

function buildItem(overrides: Partial<AddressCorrectionMailItem> = {}): AddressCorrectionMailItem {
  return {
    proposed: PROPOSED,
    reason: { distanceMetres: null, matchLevel: 'not_found' },
    recipientName: 'Mercado Bom Preço Ltda',
    reported: REPORTED,
    ...overrides,
  }
}

const BASE_PARAMS = {
  carrierName: 'Transportadora Exemplo Ltda',
  contractorName: 'Comercial Exemplo Imp Exp Ltda',
  operatorName: 'Maria Operadora',
  template: DEFAULT_TEMPLATE,
}

describe('buildAddressCorrectionMail (spec 150 T303)', () => {
  test('assunto no singular com um item', () => {
    const result = buildAddressCorrectionMail({ ...BASE_PARAMS, items: [buildItem()] })
    expect(result.subject).toBe('Correção de endereço de entrega — 1 cliente')
  })

  test('assunto no plural com N itens', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem(), buildItem(), buildItem()],
    })
    expect(result.subject).toBe('Correção de endereço de entrega — 3 clientes')
  })

  test('html começa com <!doctype html> e declara lang="pt-BR"', () => {
    const result = buildAddressCorrectionMail({ ...BASE_PARAMS, items: [buildItem()] })
    expect(result.html.startsWith('<!doctype html>')).toBe(true)
    expect(result.html).toContain('<html lang="pt-BR">')
  })

  test('os três elementos do bloco aparecem no html e no text, para 1 e para 3 itens', () => {
    for (const items of [[buildItem()], [buildItem(), buildItem(), buildItem()]]) {
      const result = buildAddressCorrectionMail({ ...BASE_PARAMS, items })

      for (const surface of [result.html, result.text]) {
        expect(surface).toContain('RUA 3, 1209 — CENTRO — ITIRAPINA/SP · 13530-000')
        expect(surface).toContain(
          'Rua Três, 1209 — Jardim Nova Itirapina — Itirapina/SP · 13530-000',
        )
        expect(surface).toContain('endereço não localizado')
      }
    }
  })

  test('a numeração dos blocos segue a ordem dos itens, em 1 e em N itens', () => {
    const single = buildAddressCorrectionMail({ ...BASE_PARAMS, items: [buildItem()] })
    expect(single.text).toContain('1. Mercado Bom Preço Ltda')

    const triple = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [
        buildItem({ recipientName: 'Cliente Um' }),
        buildItem({ recipientName: 'Cliente Dois' }),
        buildItem({ recipientName: 'Cliente Três' }),
      ],
    })
    expect(triple.text).toContain('1. Cliente Um')
    expect(triple.text).toContain('2. Cliente Dois')
    expect(triple.text).toContain('3. Cliente Três')
    expect(triple.html).toContain('>1<')
    expect(triple.html).toContain('>2<')
    expect(triple.html).toContain('>3<')
  })

  /**
   * `distanceMetres: null` é o sinal de "sem coordenada do provedor para medir" — o mesmo caso em
   * que `compare-addresses-batch.use-case.ts` (`toDistance`) já deixa a coluna em branco: cidade
   * divergente ou provedor sem coordenada. Abaixo de 1 km sai em metros inteiros; a partir de 1 km,
   * em quilômetros com vírgula decimal e uma casa (RF11).
   */
  test('motivo "não localizado" quando não há distância útil', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reason: { distanceMetres: null, matchLevel: 'approximate' } })],
    })
    expect(result.text).toContain('Motivo: endereço não localizado.')
    expect(result.html).toContain('endereço não localizado')
  })

  /**
   * `approximate` é o provedor caindo no centroide do município — a distância calculada até esse
   * ponto não é "encontramos a X metros", é só a distância até o centro da cidade. Mostrar
   * "localizado a X km" aqui insinuaria uma correspondência de rua que não existe (revisão final).
   */
  test('motivo "não localizado" quando matchLevel é approximate, mesmo com distância', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reason: { distanceMetres: 4200, matchLevel: 'approximate' } })],
    })
    expect(result.text).toContain('Motivo: endereço não localizado.')
    expect(result.html).toContain('endereço não localizado')
    expect(result.text).not.toContain('km')
  })

  test('motivo "não localizado" quando matchLevel é not_found, mesmo com distância', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reason: { distanceMetres: 500, matchLevel: 'not_found' } })],
    })
    expect(result.text).toContain('Motivo: endereço não localizado.')
    expect(result.text).not.toContain(' m do endereço')
  })

  test('motivo em quilômetros só quando o casamento é de rua/número (rooftop)', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reason: { distanceMetres: 1500, matchLevel: 'rooftop' } })],
    })
    expect(result.text).toContain('Motivo: localizado a 1,5 km do endereço informado.')
  })

  test('motivo em quilômetros, com vírgula decimal e uma casa, a partir de 1 km', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reason: { distanceMetres: 3200, matchLevel: 'range_interpolated' } })],
    })
    expect(result.text).toContain('Motivo: localizado a 3,2 km do endereço informado.')
  })

  test('motivo em metros inteiros abaixo de 1 km', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reason: { distanceMetres: 850, matchLevel: 'range_interpolated' } })],
    })
    expect(result.text).toContain('Motivo: localizado a 850 m do endereço informado.')
  })

  test('complemento e bairro ausentes não deixam separador sobrando', () => {
    const noExtras: AddressFields = {
      ...REPORTED,
      complement: null,
      district: null,
    }
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reported: noExtras })],
    })
    expect(result.text).toContain('RUA 3, 1209 — ITIRAPINA/SP · 13530-000')
    expect(result.text).not.toContain('RUA 3, 1209 —  —')
  })

  test('complemento entra depois do número, antes do bairro', () => {
    const withComplement: AddressFields = {
      ...REPORTED,
      complement: 'Fundos',
    }
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reported: withComplement })],
    })
    expect(result.text).toContain('RUA 3, 1209, Fundos — CENTRO — ITIRAPINA/SP · 13530-000')
  })

  test('recipientName null: o bloco abre pelo endereço correto, sem "null" e sem linha vazia', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ recipientName: null })],
    })
    expect(result.text).toContain(
      '1. Rua Três, 1209 — Jardim Nova Itirapina — Itirapina/SP · 13530-000',
    )
    expect(result.text).not.toContain('null')
    expect(result.html).not.toContain('null')
  })

  test('escapa < & " vindos da nota no html; o text carrega o valor literal', () => {
    const hostile: AddressFields = {
      ...REPORTED,
      district: 'Setor "Alfa" & Beta',
      street: '<script>alert(1)</script>',
    }
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem({ reported: hostile })],
    })

    expect(result.html).not.toContain('<script>alert(1)</script>')
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result.html).toContain('Setor &quot;Alfa&quot; &amp; Beta')

    expect(result.text).toContain('<script>alert(1)</script>')
    expect(result.text).toContain('Setor "Alfa" & Beta')
  })
})

/**
 * Spec 150 T402: o texto vem do modelo, o layout de `email-template.html` não muda. O modelo padrão
 * sugerido reproduz o texto aprovado; o `itemText` ocupa a linha de baixo do bloco (a do motivo).
 */
describe('buildAddressCorrectionMail com modelo (spec 150 T402)', () => {
  test('o modelo padrão reproduz o texto aprovado, palavra por palavra', () => {
    const result = buildAddressCorrectionMail({ ...BASE_PARAMS, items: [buildItem()] })

    expect(result.text).toBe(
      [
        'Olá, equipe Comercial Exemplo Imp Exp Ltda,',
        '',
        'Ao roteirizar as entregas das suas notas, não conseguimos localizar os endereços abaixo. Hoje a entrega aponta para o centro do município.',
        '',
        'Pedimos que confira e corrija o cadastro desses clientes no seu sistema, para que as próximas notas já saiam com o endereço certo.',
        '',
        '1. Mercado Bom Preço Ltda',
        'Como veio na nota: RUA 3, 1209 — CENTRO — ITIRAPINA/SP · 13530-000',
        'Endereço correto: Rua Três, 1209 — Jardim Nova Itirapina — Itirapina/SP · 13530-000',
        'Motivo: endereço não localizado.',
        '',
        'Qualquer dúvida, é só responder este e-mail.',
        '',
        'Maria Operadora',
        'Transportadora Exemplo Ltda',
        '',
        'Você recebeu este e-mail por ser contato cadastrado da Comercial Exemplo Imp Exp Ltda junto à Transportadora Exemplo Ltda. As notas fiscais não foram alteradas: a correção vale a partir do seu cadastro.',
      ].join('\n'),
    )
  })

  test('o html mantém cores e estrutura do desenho aprovado', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem(), buildItem({ recipientName: 'Distribuidora Vale Verde Ltda' })],
    })

    for (const color of Object.values(ADDRESS_CORRECTION_MAIL_COLOR)) {
      expect(result.html).toContain(color)
    }
    expect(result.html).toContain('max-width:600px')
    expect(result.html).toContain('>Correção de cadastro</div>')
    expect(result.html).toContain(
      '<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Correção de endereço de entrega — 2 clientes</h1>',
    )
    expect(result.html.match(/>Como veio na nota</g)).toHaveLength(2)
    expect(result.html.match(/>Endereço correto</g)).toHaveLength(2)
    expect(result.html).toContain(
      '<tr><td style="padding:0 16px 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8a4f1d;">Motivo: endereço não localizado.</td></tr>',
    )
    expect(result.html).toContain(
      '<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Qualquer dúvida, é só responder este e-mail.</p>',
    )
    expect(result.html).toContain(
      '<p style="margin:0;font-size:15px;line-height:1.5;"><strong>Maria Operadora</strong><br><span style="color:#6b7c85;">Transportadora Exemplo Ltda</span></p>',
    )
    expect(result.html).toContain('As notas fiscais não foram alteradas')
  })

  test('as variáveis de item saem por item, e as do e-mail no assunto', () => {
    const second: AddressFields = { ...PROPOSED, city: 'Orlândia', postalCode: '14620000' }
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem(), buildItem({ proposed: second, recipientName: 'Outro Cliente' })],
      template: {
        ...DEFAULT_TEMPLATE,
        itemText: '{cliente}: CEP {cep_como_veio} → {cep_correto}, {municipio}/{uf}',
        subject: '{quantidade} endereços de {contratante}',
      },
    })

    expect(result.subject).toBe('2 endereços de Comercial Exemplo Imp Exp Ltda')
    expect(result.text).toContain('Mercado Bom Preço Ltda: CEP 13530-000 → 13530-000, Itirapina/SP')
    expect(result.text).toContain('Outro Cliente: CEP 13530-000 → 14620-000, Orlândia/SP')
  })

  test('{clientes} concorda com a quantidade: singular com um, plural com vários', () => {
    const template = { ...DEFAULT_TEMPLATE, subject: 'Pedido: {clientes}' }
    const one = buildAddressCorrectionMail({ ...BASE_PARAMS, items: [buildItem()], template })
    const many = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem(), buildItem()],
      template,
    })

    expect(one.subject).toBe('Pedido: 1 cliente')
    expect(many.subject).toBe('Pedido: 2 clientes')
  })

  test('texto de item vazio não deixa linha no bloco', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem()],
      template: { ...DEFAULT_TEMPLATE, itemText: '' },
    })

    expect(result.html).not.toContain(`color:${ADDRESS_CORRECTION_MAIL_COLOR.amber};`)
    expect(result.text).toContain(
      'Endereço correto: Rua Três, 1209 — Jardim Nova Itirapina — Itirapina/SP · 13530-000\n\nQualquer dúvida',
    )
  })

  test('marcação digitada no modelo e valores de terceiro saem escapados no html', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      contractorName: 'Loja <b>& Cia</b>',
      items: [buildItem()],
      template: { ...DEFAULT_TEMPLATE, intro: '<img src=x onerror=alert(1)> Olá, {contratante}' },
    })

    expect(result.html).not.toContain('<img')
    expect(result.html).not.toContain('<b>')
    expect(result.html).toContain(
      '&lt;img src=x onerror=alert(1)&gt; Olá, Loja &lt;b&gt;&amp; Cia&lt;/b&gt;',
    )
    expect(result.text).toContain('<img src=x onerror=alert(1)> Olá, Loja <b>& Cia</b>')
  })

  test('quebra de linha vinda de valor nunca chega ao assunto (cabeçalho de e-mail)', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      contractorName: 'Linha um\r\nBcc: alvo@example.com',
      items: [buildItem()],
      template: { ...DEFAULT_TEMPLATE, subject: 'Para {contratante}' },
    })

    expect(result.subject).toBe('Para Linha um Bcc: alvo@example.com')
  })
})
