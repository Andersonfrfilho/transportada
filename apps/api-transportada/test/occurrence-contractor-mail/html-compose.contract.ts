/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.4 (ADR-0110 §4, §12; D12): a composição do e-mail HTML — a área de mensagem, o texto dela com o corte de
 * `linhasItens`, o texto do operador escapado e inserido depois da renderização, e o logo embutido.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CarrierIdentity,
  OccurrenceMailHtmlSource,
} from '../../src/occurrence-conversation/application/occurrence-mail.port.js'
import { OccurrenceMailTemplateMissingError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { composeOccurrenceMailHtml } from '../../src/occurrence-conversation/domain/occurrence-mail-html-compose.policy.js'
import type { OccurrenceMailSigner } from '../../src/occurrence-conversation/domain/occurrence-mail-signer.policy.js'

const CARRIER: CarrierIdentity = {
  city: 'Ribeirão Preto',
  cnpj: '11444777000161',
  displayName: 'Tapete Mágico Transportes',
  hasLogo: true,
  legalName: 'Tapete Mágico Transportes Ltda',
  state: 'SP',
}
const OPERATOR: OccurrenceMailSigner = {
  jobTitle: 'Atendimento',
  kind: 'operator',
  name: 'Ana Lima',
  userId: 'user-1',
}

const TEMPLATE = [
  '<html><body>',
  '<div>{{logoTransportadora}} <b>{{nomeExibicao}}</b></div>',
  '<!-- mensagem -->',
  '<p>Prezados, a NF {{numeroNota}} teve avaria. {{observacao}}</p>',
  '<!-- /mensagem -->',
  '{{tabelaItens}}',
  '<p>{{assinaturaNome}} — {{assinaturaCargo}}</p>',
  '</body></html>',
].join('\n')

function source(overrides: Partial<OccurrenceMailHtmlSource> = {}): OccurrenceMailHtmlSource {
  return {
    bodyTemplate: TEMPLATE,
    itemLines: ['A1 – Tapete – 2 un – R$ 10,00'],
    itemRows: [{ amount: 'R$ 10,00', code: 'A1', description: 'Tapete', quantity: '2 un' }],
    itemsSum: 'R$ 10,00',
    subjectTemplate: 'Avaria — NF {{numeroNota}}',
    values: {
      linhasItens: 'A1 – Tapete – 2 un – R$ 10,00',
      numeroNota: '48.213-1',
      observacao: '',
    },
    ...overrides,
  }
}

function compose(
  overrides: Partial<Parameters<typeof composeOccurrenceMailHtml>[0]> = {},
  sourceOverrides: Partial<OccurrenceMailHtmlSource> = {},
) {
  return composeOccurrenceMailHtml({
    appBaseUrl: undefined,
    carrier: CARRIER,
    contractorTaxId: '12345678000190',
    hasReplyTo: true,
    signer: OPERATOR,
    source: source(sourceOverrides),
    ...overrides,
  })
}

describe('spec 272 D12: a área de mensagem', () => {
  test('o texto da área é só o da área, com as variáveis preenchidas e as tags fora', () => {
    const composed = compose()
    expect(composed.areaText).toBe('Prezados, a NF 48.213-1 teve avaria.')
  })

  test('sem texto do operador: o HTML do modelo com a área original, tabela e assinatura', () => {
    const { html } = compose()
    expect(html).toContain('<p>Prezados, a NF 48.213-1 teve avaria. </p>')
    expect(html).toContain('<b>Tapete Mágico Transportes</b>')
    expect(html).toContain('cid:company-logo')
    expect(html).toContain('<td style=')
    expect(html).toContain('<p>Ana Lima — Atendimento</p>')
  })

  test('texto igual ao gerado (fim de linha e pontas normalizados) mantém a área do modelo', () => {
    const kept = compose({ operatorText: '\r\n  Prezados, a NF 48.213-1 teve avaria.  \r\n' })
    expect(kept.html).toBe(compose().html)
  })

  test('texto editado: a área vira o texto do operador, escapado em parágrafos; o resto do modelo intacto', () => {
    const { html } = compose({
      operatorText: 'Linha <b>um</b> & "dois"\nlinha três\n\nSegundo parágrafo',
    })
    expect(html).toContain('Linha &lt;b&gt;um&lt;/b&gt; &amp; &quot;dois&quot;<br>linha três')
    expect(html).toContain('Segundo parágrafo</p>')
    expect(html).not.toContain('<b>um</b>')
    expect(html).not.toContain('teve avaria')
    expect(html).toContain('<b>Tapete Mágico Transportes</b>')
    expect(html).toContain('<p>Ana Lima — Atendimento</p>')
    expect(html).toContain('<td style=')
  })

  test('texto do operador nunca passa pelo renderer: {{tabelaItens}} digitado sai literal', () => {
    const { html } = compose({ operatorText: 'veja {{tabelaItens}} e {{nomeExibicao}}' })
    expect(html).toContain('veja {{tabelaItens}} e {{nomeExibicao}}')
    expect(html.match(/<td[^>]*style=/gu)?.length).toBe(6)
  })

  test('modelo sem a área, ou com o par duplicado, é problema do modelo', () => {
    expect(() => compose({}, { bodyTemplate: '<p>{{numeroNota}}</p>' })).toThrow(
      OccurrenceMailTemplateMissingError,
    )
    expect(() =>
      compose({}, { bodyTemplate: `${TEMPLATE}\n<!-- mensagem -->x<!-- /mensagem -->` }),
    ).toThrow(OccurrenceMailTemplateMissingError)
  })

  test('HTML renderizado acima de 524288 bytes é problema do modelo, não erro 500', () => {
    expect(() =>
      compose({}, { values: { numeroNota: 'x', observacao: 'o'.repeat(600_000) } }),
    ).toThrow(OccurrenceMailTemplateMissingError)
  })

  test('texto do operador que estoura o limite do HTML também é problema do modelo', () => {
    expect(() => compose({ operatorText: 'é'.repeat(300_000) })).toThrow(
      OccurrenceMailTemplateMissingError,
    )
  })

  test('observação com <b>x</b> & "y" sai escapada na área', () => {
    const composed = compose({}, { values: { numeroNota: '1', observacao: '<b>x</b> & "y"' } })
    expect(composed.html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;')
    expect(composed.areaText).toContain('<b>x</b> & "y"')
  })
})

describe('spec 272 D4/D12: 200 itens com {{linhasItens}} na área', () => {
  const lines = Array.from(
    { length: 200 },
    (_, index) =>
      `COD${index} – Item de teste número ${index} com descrição longa – 10 un – R$ 1.234,56`,
  )
  const body = TEMPLATE.replace('{{observacao}}', '{{linhasItens}}')

  test('o texto da área cabe em 8000 (o corte de linhasItens do caminho de texto) e o HTML leva o mesmo corte', () => {
    const composed = compose(
      {},
      {
        bodyTemplate: body,
        itemLines: lines,
        itemRows: lines.map((line, index) => ({
          amount: 'R$ 1.234,56',
          code: `COD${index}`,
          description: line,
          quantity: '10 un',
        })),
        values: { linhasItens: lines.join('\n'), numeroNota: '1' },
      },
    )
    expect(composed.areaText.length).toBeLessThanOrEqual(8000)
    expect(composed.areaText).toMatch(/e mais \d+ itens?$/u)
    expect(composed.areaText.split('\n').length).toBeGreaterThan(20)
    expect(composed.html).toContain(composed.areaText.split('\n').at(-1) as string)
    expect(composed.html).toContain('COD199')
  })

  test('area sem {{linhasItens}} não corta nada', () => {
    const composed = compose({}, { itemLines: lines })
    expect(composed.areaText).toBe('Prezados, a NF 48.213-1 teve avaria.')
  })
})

describe('spec 272 D3/D9: logo embutido', () => {
  test('has_inline_logo só com {{logoTransportadora}} no modelo e logo cadastrado', () => {
    expect(compose().hasInlineLogo).toBe(true)
    expect(compose({ carrier: { ...CARRIER, hasLogo: false } }).hasInlineLogo).toBe(false)
    expect(
      compose({}, { bodyTemplate: TEMPLATE.replace('{{logoTransportadora}}', '') }).hasInlineLogo,
    ).toBe(false)
  })

  test('sem logo: iniciais, nenhum <img cid:>', () => {
    const { html } = compose({ carrier: { ...CARRIER, hasLogo: false } })
    expect(html).not.toContain('cid:')
    expect(html).toContain('>TM<')
  })
})

describe('spec 272 D5/D6: valores da transportadora e do assinante no modelo', () => {
  test('equipe: assinatura "Equipe <nome de exibição>" sem cargo', () => {
    const { html } = compose({ signer: { kind: 'team' } })
    expect(html).toContain('<p>Equipe Tapete Mágico Transportes — </p>')
  })

  test('sem perfil fiscal: renderiza com identidade vazia e sem logo', () => {
    const composed = compose({ carrier: undefined, signer: { kind: 'team' } })
    expect(composed.hasInlineLogo).toBe(false)
    expect(composed.html).toContain('<b></b>')
  })

  test('o assunto vem do modelo preenchido, sem prefixo', () => {
    expect(compose().subject).toBe('Avaria — NF 48.213-1')
  })

  test('faixaResposta só com Reply-To', () => {
    const base = TEMPLATE.replace('{{tabelaItens}}', '{{faixaResposta}}')
    expect(compose({ hasReplyTo: true }, { bodyTemplate: base }).html).toContain(
      'Responda este e-mail',
    )
    expect(compose({ hasReplyTo: false }, { bodyTemplate: base }).html).not.toContain(
      'Responda este e-mail',
    )
  })
})

describe('spec 272 review A3: corte do texto da área', () => {
  test('o corte em 8000 não parte um par substituto', () => {
    const composed = compose(
      {},
      { bodyTemplate: TEMPLATE.replace('{{observacao}}', `aa${'\u{1F600}'.repeat(5000)}`) },
    )

    expect(composed.areaText.length).toBeLessThanOrEqual(8000)
    expect(composed.areaText.endsWith('\u{1F600}')).toBe(true)
    expect(/[\uD800-\uDBFF]$/u.test(composed.areaText)).toBe(false)
  })
})
