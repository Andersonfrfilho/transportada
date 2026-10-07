/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 e spec 247 (T3.4): o texto que a empresa escreve para cada tipo de ocorrência, os dois
 * contextos de marcador (assunto/corpo e linha de item) e o modelo do SAC montado inteiro.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_DEFAULT_ITEM_LINE_TEMPLATE,
  OCCURRENCE_ITEM_LINE_PLACEHOLDERS,
  OCCURRENCE_ITEM_LINES_LIMIT,
  OCCURRENCE_SUBJECT_PLACEHOLDERS,
  OCCURRENCE_TEMPLATE_CONTEXT,
  OCCURRENCE_TEMPLATE_PLACEHOLDERS,
} from '../../src/shared/occurrence-template.constant.js'
import {
  buildOccurrenceItemValues,
  renderOccurrenceTemplate,
  unknownTemplatePlaceholders,
} from '../../src/trips/domain/occurrence-template.policy.js'
import type {
  OccurrenceTemplateLine,
  OccurrenceTemplateValues,
} from '../../src/trips/domain/occurrence-template.types.js'

const SAC_LINE: OccurrenceTemplateLine = {
  code: '2073170 02',
  declaredAmount: null,
  description: 'MAC ADRIA OVOS 500G – PARAFUSO',
  nfeQuantity: '12.000',
  quantity: '1.000',
  totalValue: '686.4000',
  unit: 'FD',
  unitValue: '57.2000',
}

/** O `SPANI` do exemplo do SAC é o nome da contratante da nota, e aqui é dado de fixture. */
const CONTRACTOR_NAME = 'SPANI'

const DADOS: OccurrenceTemplateValues = {
  contractorName: CONTRACTOR_NAME,
  declaredAmount: null,
  documentLabel: '680481',
  documentNumber: '680481',
  driverName: 'Motorista Um',
  itemCode: '2073170 02',
  itemLabel: 'MAC ADRIA OVOS 500G – PARAFUSO',
  itemLineTemplate: '',
  itemQuantity: '1',
  lines: [SAC_LINE],
  note: 'Avaria identificada no momento da conferência das mercadorias',
  occurredOn: '12/11/2025',
  recipientName: 'SUPERMERCADO TRIALBA LTDA',
  referenceNumber: '45029',
  stopLabel: 'RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP',
  totalValue: '7840.6400',
}

const SAC_SUBJECT = 'OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – DEVOLUÇÃO PARCIAL'

const SAC_BODY = `Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.

NFD {{numeroReferencia}} – R$ {{valorDeclarado}}
RAZÃO SOCIAL: {{razaoSocial}}
NOTA FISCAL: {{numeroNotaSemSerie}}
VALOR DA ENTREGA: R$ {{valorNota}}

{{linhasItens}}`

const SAC_ITEM_LINE =
  '{{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}} – {{observacao}}'

function sorted(list: readonly string[]): readonly string[] {
  return [...list].toSorted()
}

function render(template: string, overrides: Partial<OccurrenceTemplateValues> = {}): string {
  return renderOccurrenceTemplate({ template, values: { ...DADOS, ...overrides } })
}

function unknownIn(
  template: string,
  context: (typeof OCCURRENCE_TEMPLATE_CONTEXT)[keyof typeof OCCURRENCE_TEMPLATE_CONTEXT],
): readonly string[] {
  return unknownTemplatePlaceholders({ context, template })
}

describe('template da ocorrência (spec 079)', () => {
  test('troca os marcadores pelo que a nota traz', () => {
    expect(render('OCORRÊNCIA | NF {{numeroNota}} | {{razaoSocial}}')).toBe(
      'OCORRÊNCIA | NF 680481 | SUPERMERCADO TRIALBA LTDA',
    )
  })

  /**
   * ⚠️ **Marcador desconhecido é recusado no cadastro, não no envio.** Quem cadastra escreve
   * `{{numeroNF}}` achando que existe; se a recusa só viesse na hora de enviar, o operador
   * descobriria com o cliente esperando — e o e-mail sairia com `{{numeroNF}}` cru se ninguém
   * recusasse nada.
   */
  test('aponta o marcador que não existe', () => {
    expect(
      unknownIn('OCORRÊNCIA | NF {{numeroNF}} | {{razaoSocial}}', OCCURRENCE_TEMPLATE_CONTEXT.body),
    ).toEqual(['numeroNF'])
  })

  test('template só com marcadores conhecidos não tem o que apontar', () => {
    expect(unknownIn('NF {{numeroNota}} — {{item}}', OCCURRENCE_TEMPLATE_CONTEXT.body)).toEqual([])
  })

  /**
   * ⚠️ **Valor ausente vira vazio, e não o marcador cru.** A nota nem sempre tem item apontado — é
   * o caso da ocorrência da nota inteira —, e imprimir `{{item}}` no e-mail do cliente é pior que
   * imprimir nada: parece defeito do sistema para quem recebe.
   */
  test('valor ausente sai vazio, nunca o marcador', () => {
    expect(render('Item: {{item}}.', { itemLabel: '' })).toBe('Item: .')
  })

  /** Espaço dentro das chaves é o erro de digitação mais comum, e ele não pode virar buraco. */
  test('tolera espaço dentro das chaves', () => {
    expect(render('NF {{ numeroNota }}')).toBe('NF 680481')
    expect(unknownIn('{{ numeroNF }}', OCCURRENCE_TEMPLATE_CONTEXT.body)).toEqual(['numeroNF'])
  })

  /**
   * ⚠️ **A NFD não é uma constante do código.** O número nasce no balcão do cliente e entra pelo
   * campo "número do documento do cliente" do tipo (spec 247), impresso por `{{numeroReferencia}}`.
   */
  test('o número do documento do cliente tem marcador próprio, e não é por nome', () => {
    expect([...OCCURRENCE_TEMPLATE_PLACEHOLDERS]).not.toContain('nfd')
    expect(render('Documento {{numeroReferencia}}')).toBe('Documento 45029')
    expect(render('Documento {{numeroReferencia}}.', { referenceNumber: '' })).toBe('Documento .')
  })
})

describe('as três listas fechadas de marcadores (spec 247 RF5)', () => {
  const OCCURRENCE_LEVEL = [
    'codigoItem',
    'contratante',
    'data',
    'item',
    'motorista',
    'numeroNota',
    'numeroNotaSemSerie',
    'numeroReferencia',
    'observacao',
    'parada',
    'quantidadeItem',
    'razaoSocial',
    'somaItens',
    'valorDeclarado',
    'valorNota',
  ]

  test('corpo: os 11 de hoje e mais cinco, com a linha de itens', () => {
    expect(sorted(OCCURRENCE_TEMPLATE_PLACEHOLDERS)).toEqual(
      [...OCCURRENCE_LEVEL, 'linhasItens'].toSorted(),
    )
  })

  test('assunto: os do corpo, menos a linha de itens (é uma linha só)', () => {
    expect(sorted(OCCURRENCE_SUBJECT_PLACEHOLDERS)).toEqual(OCCURRENCE_LEVEL.toSorted())
  })

  test('linha de item: os de ocorrência e os sete da linha, sem a linha de itens', () => {
    expect(sorted(OCCURRENCE_ITEM_LINE_PLACEHOLDERS)).toEqual(
      [...OCCURRENCE_LEVEL, 'somaItem', 'unidadeItem', 'valorItem', 'valorUnitarioItem'].toSorted(),
    )
  })

  test('o teto é de 200 linhas e a linha padrão é a da spec', () => {
    expect(OCCURRENCE_ITEM_LINES_LIMIT).toBe(200)
    expect(OCCURRENCE_DEFAULT_ITEM_LINE_TEMPLATE).toBe(
      '{{codigoItem}} – {{item}} – {{quantidadeItem}} {{unidadeItem}} – R$ {{valorItem}}',
    )
  })

  test('os três contextos têm nome estável', () => {
    expect(OCCURRENCE_TEMPLATE_CONTEXT).toEqual({
      body: 'body',
      itemLine: 'itemLine',
      subject: 'subject',
    })
  })
})

describe('marcador no contexto errado é recusado no cadastro (spec 247 CA04)', () => {
  test('marcador de linha no corpo é recusado', () => {
    expect(unknownIn('{{valorItem}} e {{somaItem}}', OCCURRENCE_TEMPLATE_CONTEXT.body)).toEqual([
      'valorItem',
      'somaItem',
    ])
    expect(unknownIn('{{unidadeItem}}', OCCURRENCE_TEMPLATE_CONTEXT.body)).toEqual(['unidadeItem'])
    expect(unknownIn('{{valorUnitarioItem}}', OCCURRENCE_TEMPLATE_CONTEXT.body)).toEqual([
      'valorUnitarioItem',
    ])
  })

  test('marcador de linha e linha de itens no assunto são recusados', () => {
    expect(unknownIn('{{valorItem}}', OCCURRENCE_TEMPLATE_CONTEXT.subject)).toEqual(['valorItem'])
    expect(unknownIn('NF {{linhasItens}}', OCCURRENCE_TEMPLATE_CONTEXT.subject)).toEqual([
      'linhasItens',
    ])
    expect(unknownIn(SAC_SUBJECT, OCCURRENCE_TEMPLATE_CONTEXT.subject)).toEqual([])
  })

  test('a linha de itens dentro da linha é recusada (recursão)', () => {
    expect(unknownIn('{{linhasItens}}', OCCURRENCE_TEMPLATE_CONTEXT.itemLine)).toEqual([
      'linhasItens',
    ])
  })

  test('o corpo do SAC e a linha do SAC passam nos seus contextos', () => {
    expect(unknownIn(SAC_BODY, OCCURRENCE_TEMPLATE_CONTEXT.body)).toEqual([])
    expect(unknownIn(SAC_ITEM_LINE, OCCURRENCE_TEMPLATE_CONTEXT.itemLine)).toEqual([])
    expect(
      unknownIn(OCCURRENCE_DEFAULT_ITEM_LINE_TEMPLATE, OCCURRENCE_TEMPLATE_CONTEXT.itemLine),
    ).toEqual([])
  })

  test('o marcador desconhecido volta com o nome, em qualquer contexto', () => {
    expect(unknownIn('{{numeroNfd}}', OCCURRENCE_TEMPLATE_CONTEXT.itemLine)).toEqual(['numeroNfd'])
    expect(unknownIn('{{numeroNfd}}', OCCURRENCE_TEMPLATE_CONTEXT.subject)).toEqual(['numeroNfd'])
  })
})

describe('o modelo do SAC sai exatamente como o SAC escreveu (spec 247 CA01)', () => {
  test('assunto, com a contratante vinda da nota e não do código', () => {
    expect(render(SAC_SUBJECT)).toBe('OCORRÊNCIA: SPANI – NF 680481 – DEVOLUÇÃO PARCIAL')
    expect(render(SAC_SUBJECT, { contractorName: 'OUTRA CONTRATANTE' })).toBe(
      'OCORRÊNCIA: OUTRA CONTRATANTE – NF 680481 – DEVOLUÇÃO PARCIAL',
    )
  })

  test('corpo, com uma linha por item e as somas', () => {
    expect(render(SAC_BODY, { itemLineTemplate: SAC_ITEM_LINE })).toBe(
      [
        'Por favor, verificar. A loja emitiu a NFD devido à divergência identificada no ato da entrega.',
        '',
        'NFD 45029 – R$ 57,20',
        'RAZÃO SOCIAL: SUPERMERCADO TRIALBA LTDA',
        'NOTA FISCAL: 680481',
        'VALOR DA ENTREGA: R$ 7.840,64',
        '',
        '2073170 02 – MAC ADRIA OVOS 500G – PARAFUSO – 1FD – Avaria identificada no momento da conferência das mercadorias',
      ].join('\n'),
    )
  })

  test('a política não conhece a contratante nem o tipo: nem SPANI nem devolução no código', () => {
    const sources = [
      '../../src/trips/domain/occurrence-template.policy.ts',
      '../../src/shared/occurrence-template.constant.ts',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))

    for (const source of sources) {
      expect(source).not.toMatch(/SPANI/iu)
      expect(source).not.toMatch(/DEVOLU[CÇ]/iu)
    }
  })

  /** `{{numeroNota}}` não muda: modelos já gravados dependem do `número/série` (D6). */
  test('com série, o número da nota segue como era e o sem série não a leva', () => {
    const withSeries = { documentLabel: '680481/1' }
    expect(render('{{numeroNota}}', withSeries)).toBe('680481/1')
    expect(render('{{numeroNotaSemSerie}}', withSeries)).toBe('680481')
  })
})

describe('{{linhasItens}} imprime uma linha por item marcado (spec 247 RF6, RF8, RF9)', () => {
  const SECOND_LINE: OccurrenceTemplateLine = {
    code: 'ZG-4411',
    declaredAmount: '50.0000',
    description: 'Porca',
    nfeQuantity: '5.000',
    quantity: '2.500',
    totalValue: '10.0000',
    unit: 'KG',
    unitValue: '4.0000',
  }

  test('sem modelo de linha, usa a linha padrão', () => {
    expect(render('{{linhasItens}}')).toBe(
      '2073170 02 – MAC ADRIA OVOS 500G – PARAFUSO – 1 FD – R$ 57,20',
    )
    expect(render('{{linhasItens}}', { itemLineTemplate: undefined })).toBe(
      '2073170 02 – MAC ADRIA OVOS 500G – PARAFUSO – 1 FD – R$ 57,20',
    )
  })

  test('uma linha por item, na ordem marcada, separadas por quebra de linha', () => {
    expect(render('{{linhasItens}}', { lines: [SAC_LINE, SECOND_LINE] })).toBe(
      [
        '2073170 02 – MAC ADRIA OVOS 500G – PARAFUSO – 1 FD – R$ 57,20',
        'ZG-4411 – Porca – 2,5 KG – R$ 50,00',
      ].join('\n'),
    )
    expect(render('{{linhasItens}}', { lines: [SECOND_LINE, SAC_LINE] }).split('\n')[0]).toBe(
      'ZG-4411 – Porca – 2,5 KG – R$ 50,00',
    )
  })

  test('os sete marcadores da linha, com o valor pago vencendo a soma calculada', () => {
    expect(
      render('{{linhasItens}}', {
        itemLineTemplate:
          '{{codigoItem}}|{{item}}|{{quantidadeItem}}|{{unidadeItem}}|{{valorUnitarioItem}}|{{somaItem}}|{{valorItem}}',
        lines: [SECOND_LINE],
      }),
    ).toBe('ZG-4411|Porca|2,5|KG|4,00|10,00|50,00')
  })

  test('a quantidade da linha é a da ocorrência, e só cai na da NF-e quando não registrou', () => {
    const lineTemplate = '{{quantidadeItem}} {{unidadeItem}}'
    expect(
      render('{{linhasItens}}', { itemLineTemplate: lineTemplate, lines: [SECOND_LINE] }),
    ).toBe('2,5 KG')
    expect(
      render('{{linhasItens}}', {
        itemLineTemplate: lineTemplate,
        lines: [{ ...SECOND_LINE, quantity: null }],
      }),
    ).toBe('5 KG')
  })

  test('somaItens é a soma calculada, valorDeclarado é a dos valores pagos, e o da ocorrência vence', () => {
    const lines = [SAC_LINE, { ...SAC_LINE, declaredAmount: '50.0000' }]
    expect(render('{{somaItens}} | {{valorDeclarado}}', { lines })).toBe('114,40 | 107,20')
    expect(
      render('{{somaItens}} | {{valorDeclarado}}', { declaredAmount: '199.9900', lines }),
    ).toBe('114,40 | 199,99')
  })

  test('a linha cita os marcadores da ocorrência (observação, número da nota)', () => {
    expect(
      render('{{linhasItens}}', {
        itemLineTemplate: 'NF {{numeroNotaSemSerie}}: {{observacao}}',
      }),
    ).toBe('NF 680481: Avaria identificada no momento da conferência das mercadorias')
  })

  /** Nota inteira e tipo sem itens: vazio, nunca o marcador cru no e-mail do cliente. */
  test('sem item, a linha de itens e as somas saem vazias', () => {
    expect(render('[{{linhasItens}}][{{somaItens}}][{{valorDeclarado}}]', { lines: [] })).toBe(
      '[][][]',
    )
    expect(render('[{{linhasItens}}]', { lines: undefined })).toBe('[]')
  })

  test('sem item, o valor pago da ocorrência ainda é impresso', () => {
    expect(render('{{valorDeclarado}}', { declaredAmount: '50.0000', lines: [] })).toBe('50,00')
  })

  /** O teto protege o e-mail de uma nota com centenas de linhas; o que falta vira uma linha final. */
  test('teto de 200 linhas, com "e mais N itens"', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...SAC_LINE, code: `P${index + 1}` }))
    const lastOf = (count: number) =>
      render('{{linhasItens}}', { itemLineTemplate: '{{codigoItem}}', lines: many(count) }).split(
        '\n',
      )

    expect(lastOf(200)).toHaveLength(200)
    expect(lastOf(200).at(-1)).toBe('P200')

    const over = lastOf(205)
    expect(over).toHaveLength(201)
    expect(over[199]).toBe('P200')
    expect(over.at(-1)).toBe('e mais 5 itens')
    expect(lastOf(201).at(-1)).toBe('e mais 1 item')
  })
})

describe('o que veio do cliente nunca é interpretado como marcador (spec 247 plan)', () => {
  /**
   * ⚠️ **Valor de item não é re-renderizado.** A descrição do produto vem da NF-e do cliente: um
   * `{{observacao}}` dentro dela sairia trocado, ou pior, um `{{linhasItens}}` faria o e-mail
   * explodir. Cada texto entra uma vez só, e o que entrou sai como veio.
   */
  test('`{{` na descrição do item sai literal', () => {
    const line = { ...SAC_LINE, description: 'PARAFUSO {{observacao}} {{linhasItens}} {{item}}' }
    expect(
      render('{{linhasItens}}', { itemLineTemplate: '{{item}} – {{observacao}}', lines: [line] }),
    ).toBe(
      'PARAFUSO {{observacao}} {{linhasItens}} {{item}} – Avaria identificada no momento da conferência das mercadorias',
    )
  })

  test('`{{` na observação, na razão social e no código sai literal', () => {
    expect(
      render('{{observacao}}|{{razaoSocial}}|{{linhasItens}}', {
        itemLineTemplate: '{{codigoItem}}',
        lines: [{ ...SAC_LINE, code: '{{contratante}}' }],
        note: '{{linhasItens}}',
        recipientName: '{{valorNota}}',
      }),
    ).toBe('{{linhasItens}}|{{valorNota}}|{{contratante}}')
  })
})

describe('o valor da nota sai em formato brasileiro, sem símbolo (spec 247 RF7, D4)', () => {
  test('7840.6400 vira 7.840,64, e `R$ {{valorNota}}` gravado continua certo', () => {
    expect(render('{{valorNota}}')).toBe('7.840,64')
    expect(render('R$ {{valorNota}}')).toBe('R$ 7.840,64')
  })

  test('valor ausente sai vazio', () => {
    expect(render('[{{valorNota}}]', { totalValue: '' })).toBe('[]')
  })
})

describe('os marcadores antigos do corpo seguem como eram, com a quantidade formatada (spec 247 RF8, D5)', () => {
  const ITENS = [
    { code: 'ZG-4410', description: 'Parafuso sextavado', quantity: '12.000' },
    { code: 'ZG-4411', description: 'Porca', quantity: '2.500' },
  ] as const

  test('a quantidade da ocorrência sai sem zeros à direita, e os itens seguem juntos por vírgula', () => {
    expect(buildOccurrenceItemValues(ITENS)).toEqual({
      itemCode: 'ZG-4410, ZG-4411',
      itemLabel: 'Parafuso sextavado, Porca',
      itemQuantity: '12, 2,5',
    })
  })

  test('quantidade numérica continua aceita', () => {
    expect(buildOccurrenceItemValues([{ code: 'A', description: 'B', quantity: 2.5 }])).toEqual({
      itemCode: 'A',
      itemLabel: 'B',
      itemQuantity: '2,5',
    })
  })
})
