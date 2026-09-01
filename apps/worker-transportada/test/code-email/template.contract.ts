/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O e-mail de código de acesso assina duas vezes: a marca da transportadora no topo e no rodapé de
 * contato, e a da Ada Technology no fim, com link para o site.
 */
import { describe, expect, test } from 'bun:test'

import { renderCodeEmail } from '../../src/identity/domain/code-email-template.service.js'

const CONTENT = {
  code: 'b09a9bdfa8f3c2d2',
  headline: 'Seu código de recuperação de senha',
  intro: 'Use o código abaixo para definir uma nova senha de acesso.',
  note: 'O código é de uso único e expira em 15 minutos.',
} as const

const BRAND = {
  accentColor: '#1a2b3c',
  apiBaseUrl: 'https://api.exemplo.com.br',
  appBaseUrl: 'https://painel.exemplo.com.br/',
  contactEmail: 'contato@exemplo.com.br',
  contactPhone: '(16) 3333-4444',
  logoUrl: 'https://api.exemplo.com.br/public/landing-logo',
  name: 'Transportes Exemplo',
} as const

const LEGAL = {
  city: 'RIBEIRAO PRETO',
  complement: 'SALA 2',
  district: 'INDEPENDENCIA',
  legalName: 'TAPETE MAGICO TRANSPORTADORA LTDA',
  number: '2296',
  postalCode: '14076400',
  state: 'SP',
  street: 'MOGIANA',
  taxId: '12345678000195',
} as const

const EMPTY_BRAND = {
  accentColor: undefined,
  apiBaseUrl: 'https://api.exemplo.com.br',
  appBaseUrl: undefined,
  contactEmail: undefined,
  contactPhone: undefined,
  logoUrl: undefined,
  name: undefined,
} as const

describe('o template do e-mail de código', () => {
  test('o topo leva o logotipo e o nome da transportadora, com a cor do cadastro', () => {
    const { html } = renderCodeEmail({ brand: BRAND, content: CONTENT, year: 2026 })

    expect(html).toContain('src="https://api.exemplo.com.br/public/landing-logo"')
    expect(html).toContain('Transportes Exemplo')
    expect(html).toContain('#1a2b3c')
  })

  test('o rodapé de contato traz e-mail e telefone da empresa', () => {
    const { html, text } = renderCodeEmail({ brand: BRAND, content: CONTENT, year: 2026 })

    expect(html).toContain('mailto:contato@exemplo.com.br')
    expect(html).toContain('(16) 3333-4444')
    expect(text).toContain('contato@exemplo.com.br')
    expect(text).toContain('(16) 3333-4444')
  })

  test('a assinatura da Ada Technology leva ano, link do site e o desenho da marca', () => {
    const { html, text } = renderCodeEmail({ brand: BRAND, content: CONTENT, year: 2026 })

    expect(html).toContain('© 2026')
    expect(html).toContain('href="https://adatechnology.com.br"')
    expect(html).toContain('Ada Technology')
    expect(html).toContain('src="https://painel.exemplo.com.br/icons/ada-technology.png"')
    expect(text).toContain('© 2026 Ada Technology — TransportAdA · https://adatechnology.com.br')
  })

  test('o código aparece destacado, e o texto alternativo diz o mesmo que o HTML', () => {
    const { html, text } = renderCodeEmail({ brand: BRAND, content: CONTENT, year: 2026 })

    expect(html).toContain(CONTENT.code)
    expect(html).toContain(CONTENT.intro)
    expect(html).toContain('não responda este e-mail')
    expect(text).toContain(CONTENT.code)
    expect(text).toContain(CONTENT.note)
    expect(text).toContain('não responda este e-mail')
  })

  /**
   * O e-mail é endereçado a uma pessoa: o retrato dela entra na identidade quando a ficha tem um, e
   * a inicial ocupa o lugar quando não — nenhuma ficha fica sem identidade.
   */
  test('a identidade mostra o retrato de quem recebe quando ele existe', () => {
    const { html, text } = renderCodeEmail({
      brand: BRAND,
      content: CONTENT,
      recipient: { name: 'Ana Souza', pictureToken: 'a'.repeat(43) },
      year: 2026,
    })

    expect(html).toContain(
      `https://api.exemplo.com.br/public/company-users/${'a'.repeat(43)}/picture`,
    )
    expect(html).toContain('Ana Souza')
    expect(text).toContain('Ana Souza')
  })

  test('sem foto cadastrada a identidade cai na inicial do nome', () => {
    const { html } = renderCodeEmail({
      brand: BRAND,
      content: CONTENT,
      recipient: { name: 'ana souza', pictureToken: undefined },
      year: 2026,
    })

    expect(html).toContain('>A<')
    expect(html).not.toContain('/picture')
  })

  /** Sem endereço de API não há como montar o link da foto — a inicial cobre, e nada quebra. */
  test('sem endereço de API a foto não vira link inventado', () => {
    const { html } = renderCodeEmail({
      brand: { ...BRAND, apiBaseUrl: undefined },
      content: CONTENT,
      recipient: { name: 'Ana Souza', pictureToken: 'a'.repeat(43) },
      year: 2026,
    })

    expect(html).not.toContain('/picture')
    expect(html).toContain('>A<')
  })

  /** O topo é da empresa contratante; o rodapé é do produto, com a assinatura da Ada embaixo. */
  test('a marca do produto assina embaixo, e a da empresa em cima', () => {
    const { html } = renderCodeEmail({ brand: BRAND, content: CONTENT, year: 2026 })
    const companyLogo = html.indexOf('public/landing-logo')
    const productMark = html.indexOf('/icons/icon-192.png')
    const adaSignature = html.indexOf('adatechnology.com.br')

    expect(companyLogo).toBeGreaterThan(-1)
    expect(productMark).toBeGreaterThan(companyLogo)
    expect(adaSignature).toBeGreaterThan(productMark)
  })

  /**
   * ⚠️ Sem `font-family` em cada elemento o cliente cai no padrão dele, que é serifado — o e-mail
   * saía com cara de outro produto. Herança por tabela não é confiável no Outlook.
   */
  test('toda linha declara a fonte, e o código sai em monoespaçada', () => {
    const { html } = renderCodeEmail({ brand: BRAND, content: CONTENT, year: 2026 })
    const textNodes = html.match(/<(?:p|span|h1|strong)[^>]*>/gu) ?? []

    expect(textNodes.length).toBeGreaterThan(4)
    for (const node of textNodes) {
      if (node.startsWith('<strong')) continue
      expect(`${node.slice(0, 24)} declara fonte: ${node.includes('font-family')}`).toContain(
        'declara fonte: true',
      )
    }
    expect(html).toContain('Consolas')
  })

  /**
   * E-mail do sistema não tem pessoa no cabeçalho: sem nome de quem recebe, é o rodapé que responde
   * de quem a mensagem é — razão social, CNPJ e endereço.
   */
  test('o envio do sistema leva CNPJ e endereço no rodapé', () => {
    const { html, text } = renderCodeEmail({
      brand: BRAND,
      content: CONTENT,
      legal: LEGAL,
      year: 2026,
    })

    expect(html).toContain('CNPJ 12.345.678/0001-95')
    expect(html).toContain('MOGIANA, 2296')
    expect(html).toContain('RIBEIRAO PRETO/SP')
    expect(html).toContain('14076-400')
    expect(text).toContain('CNPJ 12.345.678/0001-95')
  })

  /** Com pessoa no cabeçalho, o rodapé legal é ruído: quem manda já está dito lá em cima. */
  test('o envio a uma pessoa não repete CNPJ e endereço', () => {
    const { html } = renderCodeEmail({
      brand: BRAND,
      content: CONTENT,
      legal: LEGAL,
      recipient: { name: 'Ana Souza', pictureToken: undefined },
      year: 2026,
    })

    expect(html).not.toContain('CNPJ')
    expect(html).toContain('Ana Souza')
  })

  /**
   * ⚠️ A máscara é por posição, nunca por dígito: a base do CNPJ tem letra desde a IN RFB 2229/2024,
   * e formatador que filtra dígito imprime documento alfanumérico sob máscara errada.
   */
  test('o CNPJ alfanumérico sai sob a máscara certa', () => {
    const { html } = renderCodeEmail({
      brand: BRAND,
      content: CONTENT,
      legal: { ...LEGAL, taxId: '12ABC34501DE35' },
      year: 2026,
    })

    expect(html).toContain('CNPJ 12.ABC.345/01DE-35')
  })

  /** Complemento vazio é o caso comum: endereço não imprime campo em branco nem separador solto. */
  test('endereço sem complemento não deixa separador órfão', () => {
    const { html } = renderCodeEmail({
      brand: BRAND,
      content: CONTENT,
      legal: { ...LEGAL, complement: '' },
      year: 2026,
    })

    expect(html).toContain('MOGIANA, 2296 · INDEPENDENCIA')
    expect(html).not.toContain('·  ·')
  })

  test('sem cadastro nenhum o e-mail sai com a marca do produto, sem imagem quebrada', () => {
    const { html } = renderCodeEmail({ brand: EMPTY_BRAND, content: CONTENT, year: 2026 })

    expect(html).toContain('TransportAdA')
    expect(html).toContain('Ada Technology')
    expect(html).not.toContain('<img')
  })

  test('cor fora do formato hex de 6 dígitos cai no padrão em vez de vazar para o estilo', () => {
    const { html } = renderCodeEmail({
      brand: { ...BRAND, accentColor: 'red;background-image:url(x)' },
      content: CONTENT,
      year: 2026,
    })

    expect(html).not.toContain('url(x)')
    /* Sem cor válida, a moldura usa o cobre da paleta copiada dos tokens do painel. */
    expect(html).toContain('#d58a47')
  })

  test('texto de cadastro é escapado — o nome da marca é digitado pelo operador', () => {
    const { html } = renderCodeEmail({
      brand: { ...BRAND, name: 'Exemplo <script>alert(1)</script>' },
      content: CONTENT,
      year: 2026,
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
