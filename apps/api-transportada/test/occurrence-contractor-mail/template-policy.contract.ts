/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.3 (ADR-0108, D4/D5): quando um modelo do módulo de notificação serve ao e-mail à contratante.
 * Política pura: todos os problemas de uma vez, e o que bloqueia o envio.
 */
import { describe, expect, test } from 'bun:test'

import {
  HTML_BODY_PATTERN,
  OCCURRENCE_CONTRACTOR_MAIL_VARIABLES,
} from '../../src/occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import {
  assessContractorTemplate,
  blocksContractorMailSend,
} from '../../src/occurrence-conversation/domain/occurrence-contractor-template.policy.js'
import { NOTIFICATION_TEMPLATE_KEY } from '../../src/notification/domain/notification-catalog.constant.js'

const AREA_OPEN = '<!-- mensagem -->'
const AREA_CLOSE = '<!-- /mensagem -->'
const AREA = `${AREA_OPEN}<p>Olá {{contratante}}</p>${AREA_CLOSE}`
const HTML_GOOD = `<table><tr><td style="color:#000">{{numeroNota}}</td></tr></table>${AREA}`

const GOOD = {
  body: 'Olá, {{contratante}}.\n\nNota {{numeroNota}}\n\n{{linhasItens}}',
  subject: 'Ocorrência na nota {{numeroNota}}',
}

describe('spec 271: modelo utilizável no e-mail à contratante', () => {
  test('modelo de texto com variáveis da lista não tem problema', () => {
    expect(assessContractorTemplate({ key: 'ocorrencia.avaria', template: GOOD })).toEqual([])
  })

  test('toda variável da lista fechada é aceita', () => {
    const body = OCCURRENCE_CONTRACTOR_MAIL_VARIABLES.map(({ name }) => `{{${name}}}`).join(' ')

    expect(
      assessContractorTemplate({ key: 'ocorrencia.avaria', template: { ...GOOD, body } }),
    ).toEqual([])
  })

  test('espaços dentro das chaves valem, como no módulo', () => {
    expect(
      assessContractorTemplate({
        key: 'ocorrencia.avaria',
        template: { body: '{{ numeroNota }}', subject: 'Assunto' },
      }),
    ).toEqual([])
  })

  test('sem modelo ativo: not_found, e nada mais a conferir', () => {
    expect(assessContractorTemplate({ key: 'ocorrencia.avaria', template: null })).toEqual([
      { code: 'not_found' },
    ])
  })

  test('chave de aviso do sistema: system_key', () => {
    expect(
      assessContractorTemplate({
        key: NOTIFICATION_TEMPLATE_KEY.TRIP_DELIVERY_OCCURRENCE,
        template: GOOD,
      }),
    ).toEqual([{ code: 'system_key' }])
  })

  test('corpo HTML seguro com a área de mensagem: utilizável', () => {
    expect(
      assessContractorTemplate({
        key: 'ocorrencia.avaria',
        template: { ...GOOD, body: HTML_GOOD },
      }),
    ).toEqual([])
  })

  test('corpo HTML inseguro: unsafe_html (tag, evento, esquema, placeholder em tag)', () => {
    for (const unsafe of [
      '<script>x</script>',
      '<a href="#" onclick="x()">a</a>',
      '<a href="java&#115;cript:x">a</a>',
      '<a href="{{contratante}}">a</a>',
    ]) {
      expect(
        assessContractorTemplate({
          key: 'ocorrencia.avaria',
          template: { ...GOOD, body: `${unsafe}${AREA}` },
        }),
      ).toEqual([{ code: 'unsafe_html' }])
    }
  })

  test('corpo HTML sem a área de mensagem ou com o par desbalanceado: missing_message_area', () => {
    for (const body of [
      '<p>Olá {{contratante}}</p>',
      `<p>x</p>${AREA_OPEN}<p>y</p>`,
      `${AREA}${AREA}`,
    ]) {
      expect(
        assessContractorTemplate({ key: 'ocorrencia.avaria', template: { ...GOOD, body } }),
      ).toEqual([{ code: 'missing_message_area' }])
    }
  })

  test('chave de HTML do sistema dentro da área: unsafe_html', () => {
    expect(
      assessContractorTemplate({
        key: 'ocorrencia.avaria',
        template: {
          ...GOOD,
          body: `<p>x</p>${AREA_OPEN}<p>{{tabelaItens}}</p>${AREA_CLOSE}`,
        },
      }).map((problem) => problem.code),
    ).toContain('unsafe_html')
  })

  test('texto puro nunca é avaliado pela regra de HTML inseguro', () => {
    expect(
      assessContractorTemplate({
        key: 'ocorrencia.avaria',
        template: { ...GOOD, body: 'O cliente ficou online = sim. {{numeroNota}}' },
      }),
    ).toEqual([])
  })

  test('texto com sinal de menor que não é HTML', () => {
    expect(
      assessContractorTemplate({
        key: 'ocorrencia.avaria',
        template: { ...GOOD, body: 'Valor < 10 e > 5, nota {{numeroNota}}' },
      }),
    ).toEqual([])
  })

  test('assunto vazio ou só espaços: empty_subject', () => {
    expect(
      assessContractorTemplate({ key: 'ocorrencia.avaria', template: { ...GOOD, subject: '   ' } }),
    ).toEqual([{ code: 'empty_subject' }])
  })

  test('variável fora da lista, no assunto e no corpo: unknown_variables com a lista sem repetição', () => {
    expect(
      assessContractorTemplate({
        key: 'ocorrencia.avaria',
        template: {
          body: '{{foo}} {{numeroNota}} {{bar}} {{foo}}',
          subject: '{{baz}}',
        },
      }),
    ).toEqual([{ code: 'unknown_variables', variables: ['baz', 'foo', 'bar'] }])
  })

  test('chave malformada que o renderizador não capta: malformed_placeholder', () => {
    for (const body of ['{{foo-bar}}', '{{}}', '{{ a b }}', 'texto {{numeroNota']) {
      expect(
        assessContractorTemplate({ key: 'ocorrencia.avaria', template: { ...GOOD, body } }),
      ).toEqual([{ code: 'malformed_placeholder' }])
    }
  })

  test('todos os problemas de uma vez, na ordem fixa', () => {
    const problems = assessContractorTemplate({
      key: NOTIFICATION_TEMPLATE_KEY.TRIP_DELIVERY_OCCURRENCE,
      template: { body: '<script>{{foo}}</script> {{x-y}}', subject: '' },
    })

    expect(problems.map((problem) => problem.code)).toEqual([
      'system_key',
      'unsafe_html',
      'missing_message_area',
      'empty_subject',
      'unknown_variables',
      'malformed_placeholder',
    ])
  })
})

describe('spec 271: o que bloqueia o envio é só o que torna o modelo inexistente (D5, D9)', () => {
  test('sem modelo, HTML inseguro, sem área e assunto vazio bloqueiam', () => {
    for (const code of [
      'not_found',
      'unsafe_html',
      'missing_message_area',
      'empty_subject',
    ] as const) {
      expect(blocksContractorMailSend([{ code }])).toBe(true)
    }
  })

  test('variável desconhecida e chave malformada não bloqueiam: saem vazias', () => {
    expect(blocksContractorMailSend([{ code: 'unknown_variables', variables: ['foo'] }])).toBe(
      false,
    )
    expect(blocksContractorMailSend([{ code: 'malformed_placeholder' }])).toBe(false)
  })

  test('sem problema, não bloqueia', () => {
    expect(blocksContractorMailSend([])).toBe(false)
  })
})

/** Espelhada no worker (`html-body-pattern.contract.ts`): mesmo valor e mesma tabela de casos. */
describe('spec 271: HTML_BODY_PATTERN é o mesmo da fila do varredor do worker', () => {
  const CASES: readonly (readonly [string, boolean])[] = [
    ['<p>html</p>', true],
    ['texto <b>negrito</b>', true],
    ['quebra<br/>aqui', true],
    ['</div>', true],
    ['<a href="x">link</a>', true],
    ['a < b e c > d', false],
    ['<3 amor', false],
    ['1<2', false],
    ['Nota {{numeroNota}}', false],
    ['<!-- comentário -->', false],
    ['', false],
  ]

  test('o valor combinado', () => {
    expect(HTML_BODY_PATTERN).toBe('</?[A-Za-z][A-Za-z0-9_:-]*[\\s>/]')
  })

  test.each(CASES)('%j → %p', (body, isHtml) => {
    expect(new RegExp(HTML_BODY_PATTERN, 'u').test(body)).toBe(isHtml)
  })
})
