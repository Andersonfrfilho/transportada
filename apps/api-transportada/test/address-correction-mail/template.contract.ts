/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { AddressFields } from '../../src/address-correction/application/address-correction.port.js'
import { ADDRESS_CORRECTION_MAIL_COLOR } from '../../src/address-correction/domain/address-correction-mail.constant.js'
import { buildAddressCorrectionMail } from '../../src/address-correction/domain/address-correction-mail.template.js'
import type { AddressCorrectionMailItem } from '../../src/address-correction/domain/address-correction-mail.types.js'
import { readAddressCorrectionMailTemplateFile } from '../../src/occurrence-conversation/application/occurrence-mail-templates-publish.service.js'

/** O modelo padrão é o arquivo `.html` que a publicação grava no módulo de notificação (spec 286, T6). */
const DEFAULT_TEMPLATE = readAddressCorrectionMailTemplateFile()

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

describe('buildAddressCorrectionMail (spec 150 T303, modelo do módulo na spec 286)', () => {
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
    expect(single.text).toContain('1 Mercado Bom Preço Ltda')

    const triple = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [
        buildItem({ recipientName: 'Cliente Um' }),
        buildItem({ recipientName: 'Cliente Dois' }),
        buildItem({ recipientName: 'Cliente Três' }),
      ],
    })
    expect(triple.text).toContain('1 Cliente Um')
    expect(triple.text).toContain('2 Cliente Dois')
    expect(triple.text).toContain('3 Cliente Três')
    expect(triple.html).toContain('>1</span>')
    expect(triple.html).toContain('>2</span>')
    expect(triple.html).toContain('>3</span>')
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
      '1 Rua Três, 1209 — Jardim Nova Itirapina — Itirapina/SP · 13530-000',
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
 * Spec 286 (T6): o texto e o layout vêm do modelo do módulo de notificação; a API só preenche as variáveis de texto
 * (escapadas) e monta o HTML dos blocos de endereço.
 */
describe('buildAddressCorrectionMail com o modelo do módulo (spec 286)', () => {
  test('o modelo padrão reproduz o texto aprovado, palavra por palavra', () => {
    const result = buildAddressCorrectionMail({ ...BASE_PARAMS, items: [buildItem()] })

    for (const sentence of [
      'Olá, equipe Comercial Exemplo Imp Exp Ltda,',
      'Ao roteirizar as entregas das suas notas, não conseguimos localizar os endereços abaixo.',
      'Pedimos que confira e corrija o cadastro desses clientes no seu sistema',
      'Qualquer dúvida, é só responder este e-mail.',
      'Maria Operadora',
      'Transportadora Exemplo Ltda',
      'As notas fiscais não foram alteradas: a correção vale a partir do seu',
    ]) {
      expect(result.text).toContain(sentence)
    }
  })

  test('o html mantém as cores e a estrutura do desenho aprovado', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem(), buildItem({ recipientName: 'Distribuidora Vale Verde Ltda' })],
    })

    for (const color of Object.values(ADDRESS_CORRECTION_MAIL_COLOR)) {
      expect(result.html).toContain(color)
    }
    expect(result.html).toContain('max-width: 600px')
    expect(result.html).toContain('Correção de cadastro')
    expect(result.html.match(/>Como veio na nota</g)).toHaveLength(2)
    expect(result.html.match(/>Endereço correto</g)).toHaveLength(2)
    expect(result.html).toContain('Motivo: endereço não localizado.</td></tr>')
    expect(result.html).toContain('<strong>Maria Operadora</strong>')
    expect(result.html).toContain('As notas fiscais não foram alteradas')
  })

  test('as variáveis do e-mail saem no assunto e no corpo do modelo', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem(), buildItem({ recipientName: 'Outro Cliente' })],
      template: { ...DEFAULT_TEMPLATE, subject: '{{quantidade}} endereços de {{contratante}}' },
    })

    expect(result.subject).toBe('2 endereços de Comercial Exemplo Imp Exp Ltda')
  })

  test('{{clientes}} concorda com a quantidade: singular com um, plural com vários', () => {
    const template = { ...DEFAULT_TEMPLATE, subject: 'Pedido: {{clientes}}' }
    const one = buildAddressCorrectionMail({ ...BASE_PARAMS, items: [buildItem()], template })
    const many = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem(), buildItem()],
      template,
    })

    expect(one.subject).toBe('Pedido: 1 cliente')
    expect(many.subject).toBe('Pedido: 2 clientes')
  })

  test('a chave {blocosEnderecos} no assunto sai vazia: HTML do sistema nunca vai a cabeçalho', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      items: [buildItem()],
      template: { ...DEFAULT_TEMPLATE, subject: 'Pedido {{blocosEnderecos}}' },
    })

    expect(result.subject).toBe('Pedido')
  })

  test('valores de terceiro saem escapados no html, e o text carrega o valor literal', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      contractorName: 'Loja <b>& Cia</b>',
      items: [buildItem()],
    })

    expect(result.html).not.toContain('<b>& Cia</b>')
    expect(result.html).toContain('Loja &lt;b&gt;&amp; Cia&lt;/b&gt;')
    expect(result.text).toContain('Loja <b>& Cia</b>')
  })

  test('quebra de linha vinda de valor nunca chega ao assunto (cabeçalho de e-mail)', () => {
    const result = buildAddressCorrectionMail({
      ...BASE_PARAMS,
      contractorName: 'Linha um\r\nBcc: alvo@example.com',
      items: [buildItem()],
      template: { ...DEFAULT_TEMPLATE, subject: 'Para {{contratante}}' },
    })

    expect(result.subject).toBe('Para Linha um Bcc: alvo@example.com')
  })
})
