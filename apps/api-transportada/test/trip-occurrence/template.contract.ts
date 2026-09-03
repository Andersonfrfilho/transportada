/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_TEMPLATE_PLACEHOLDERS,
  renderOccurrenceTemplate,
  unknownTemplatePlaceholders,
} from '../../src/trips/domain/occurrence-template.policy.js'

const DADOS = {
  documentLabel: '680481',
  driverName: 'Motorista Um',
  itemLabel: 'MAC ADRIA OVOS 500G',
  recipientName: 'SUPERMERCADO EXEMPLO LTDA',
  stopLabel: 'RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP',
  totalValue: 'R$ 7.840,64',
}

describe('template da ocorrência (spec 079)', () => {
  test('troca os marcadores pelo que a nota traz', () => {
    expect(
      renderOccurrenceTemplate({
        template: 'OCORRÊNCIA | NF {{numeroNota}} | {{razaoSocial}}',
        values: DADOS,
      }),
    ).toBe('OCORRÊNCIA | NF 680481 | SUPERMERCADO EXEMPLO LTDA')
  })

  /**
   * ⚠️ **Marcador desconhecido é recusado no cadastro, não no envio.** Quem cadastra escreve
   * `{{numeroNF}}` achando que existe; se a recusa só viesse na hora de enviar, o operador
   * descobriria com o cliente esperando — e o e-mail sairia com `{{numeroNF}}` cru se ninguém
   * recusasse nada.
   */
  test('aponta o marcador que não existe', () => {
    expect(unknownTemplatePlaceholders('OCORRÊNCIA | NF {{numeroNF}} | {{razaoSocial}}')).toEqual([
      'numeroNF',
    ])
  })

  test('template só com marcadores conhecidos não tem o que apontar', () => {
    expect(unknownTemplatePlaceholders('NF {{numeroNota}} — {{item}}')).toEqual([])
  })

  /**
   * ⚠️ **Valor ausente vira vazio, e não o marcador cru.** A nota nem sempre tem item apontado — é
   * o caso da ocorrência da nota inteira —, e imprimir `{{item}}` no e-mail do cliente é pior que
   * imprimir nada: parece defeito do sistema para quem recebe.
   */
  test('valor ausente sai vazio, nunca o marcador', () => {
    expect(
      renderOccurrenceTemplate({
        template: 'Item: {{item}}.',
        values: { ...DADOS, itemLabel: '' },
      }),
    ).toBe('Item: .')
  })

  /** Os marcadores são lista fechada: é ela que a tela mostra a quem está escrevendo o texto. */
  test('a lista de marcadores é fechada e nomeada', () => {
    expect([...OCCURRENCE_TEMPLATE_PLACEHOLDERS].toSorted()).toEqual([
      'item',
      'motorista',
      'numeroNota',
      'parada',
      'razaoSocial',
      'valorNota',
    ])
  })

  /** Espaço dentro das chaves é o erro de digitação mais comum, e ele não pode virar buraco. */
  test('tolera espaço dentro das chaves', () => {
    expect(renderOccurrenceTemplate({ template: 'NF {{ numeroNota }}', values: DADOS })).toBe(
      'NF 680481',
    )
  })
})
