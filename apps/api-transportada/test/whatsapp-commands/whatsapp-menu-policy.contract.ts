/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T007 — a política de menu (pura) e a validação de publicação do grafo. Números
 * confirmados na doc oficial da Meta (evidence.md § T007): botões ≤3/título 20, lista ≤10
 * linhas/título 24, `buttonText` 20, descrição de linha 72, corpo 1024, título de seção 24.
 */
import { describe, expect, test } from 'bun:test'
import type { FlowGraphData, FlowNodeData } from '@adatechnology/meta-whatsapp-contracts'

import {
  WHATSAPP_CHOICE_LIMIT,
  WHATSAPP_MENU_NOTHING_TO_SHOW,
} from '../../src/whatsapp-commands/domain/whatsapp-menu.constant.js'
import { WhatsAppMenuPolicyViolationError } from '../../src/whatsapp-commands/domain/whatsapp-menu.error.js'
import {
  parseMenuPageNavigation,
  planChoiceMessage,
  validateFlowGraphForWhatsApp,
  type WhatsAppMenuOption,
} from '../../src/whatsapp-commands/domain/whatsapp-menu.policy.js'
import { WHATSAPP_ROOT_FLOW } from '../../src/whatsapp-commands/domain/whatsapp-root-flow.constant.js'

function options(count: number): WhatsAppMenuOption[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `o${index}`,
    title: `Opção ${index}`,
  }))
}

const TITLE_20_WITH_EMOJI = '📦 Ver notas pendente'
const TITLE_21_WITH_EMOJI = '📦 Ver notas pendentes'
const TITLE_20_WITHOUT_EMOJI = 'Ver notas pendente 2'
const TITLE_21_WITHOUT_EMOJI = 'Ver notas pendente 22'

describe('planChoiceMessage (spec 144 T007)', () => {
  test.each([1, 3])('%i opção(ões) sai como botões', (count) => {
    const plan = planChoiceMessage({ body: 'b', options: options(count), source: 'graph' })

    expect(plan.kind).toBe('buttons')
    expect(plan.kind === 'buttons' ? plan.buttons : []).toHaveLength(count)
  })

  test.each([4, 10])('%i opções sai como lista, sem paginação', (count) => {
    const plan = planChoiceMessage({ body: 'b', options: options(count), source: 'graph' })

    expect(plan.kind).toBe('list')
    if (plan.kind === 'list') {
      expect(plan.rows).toHaveLength(count)
      expect(plan.hasMore).toBe(false)
      expect(plan.page).toBe(1)
    }
  })

  test('11 opções dinâmicas: a primeira página traz 9 e "➡️ Mais"', () => {
    const plan = planChoiceMessage({ body: 'b', options: options(11), source: 'dynamic' })

    expect(plan.kind).toBe('list')
    if (plan.kind !== 'list') return
    expect(plan.rows.map((row) => row.id)).toEqual([
      'o0',
      'o1',
      'o2',
      'o3',
      'o4',
      'o5',
      'o6',
      'o7',
      'o8',
      '__more__:2',
    ])
    expect(plan.hasMore).toBe(true)
  })

  test('27 opções dinâmicas: quatro páginas (9+8+8+2), sem furo e sem repetição', () => {
    const all = options(27)
    const pages = [1, 2, 3, 4].map((page) => {
      const plan = planChoiceMessage({ body: 'b', options: all, page, source: 'dynamic' })
      if (plan.kind !== 'list') throw new Error('esperava lista')
      return plan
    })

    for (const plan of pages)
      expect(plan.rows.length).toBeLessThanOrEqual(WHATSAPP_CHOICE_LIMIT.listRows)
    expect(pages[0]?.rows.map((row) => row.id)).toEqual([
      'o0',
      'o1',
      'o2',
      'o3',
      'o4',
      'o5',
      'o6',
      'o7',
      'o8',
      '__more__:2',
    ])
    expect(pages[1]?.rows.map((row) => row.id)).toEqual([
      '__back__:1',
      'o9',
      'o10',
      'o11',
      'o12',
      'o13',
      'o14',
      'o15',
      'o16',
      '__more__:3',
    ])
    expect(pages[2]?.rows.map((row) => row.id)).toEqual([
      '__back__:2',
      'o17',
      'o18',
      'o19',
      'o20',
      'o21',
      'o22',
      'o23',
      'o24',
      '__more__:4',
    ])
    expect(pages[3]?.rows.map((row) => row.id)).toEqual(['__back__:3', 'o25', 'o26'])
    expect(pages[3]?.hasMore).toBe(false)

    const realIds = pages
      .flatMap((plan) => plan.rows.map((row) => row.id))
      .filter((id) => !id.startsWith('__more__:') && !id.startsWith('__back__:'))
    expect(realIds).toEqual(all.map((option) => option.id))
  })

  test('nó estático acima de 10 opções nunca pagina — é violação de publicação', () => {
    expect(() => planChoiceMessage({ body: 'b', options: options(11), source: 'graph' })).toThrow(
      WhatsAppMenuPolicyViolationError,
    )
  })

  test('título de opção dinâmica maior que o teto é truncado com "…", id preservado', () => {
    const long = options(11)
    long[3] = {
      id: 'far',
      title: 'Um título de linha bem mais longo que vinte e quatro caracteres',
    }

    const plan = planChoiceMessage({ body: 'b', options: long, source: 'dynamic' })
    if (plan.kind !== 'list') throw new Error('esperava lista')
    const row = plan.rows.find((entry) => entry.id === 'far')

    expect(row?.title.endsWith('…')).toBe(true)
    expect(row?.title.length).toBeLessThanOrEqual(WHATSAPP_CHOICE_LIMIT.listRowTitle)
  })

  test('título de opção estática maior que o teto nunca é truncado em silêncio — lança', () => {
    const long = options(4)
    long[0] = {
      id: 'far',
      title: 'Um título de linha bem mais longo que vinte e quatro caracteres',
    }

    expect(() => planChoiceMessage({ body: 'b', options: long, source: 'graph' })).toThrow(
      WhatsAppMenuPolicyViolationError,
    )
  })

  /**
   * T020 (B3): a página fica no `context` e a lista é relida a cada passo. Alguém despachando pelo
   * painel encolhe a lista entre dois toques, e lançar aqui deixava a conversa muda.
   */
  test('lista que encolhe entre dois toques: a página gravada vira a última que existe', () => {
    const before = planChoiceMessage({
      body: 'b',
      options: options(27),
      page: 4,
      source: 'dynamic',
    })
    expect(before.kind === 'list' && before.page).toBe(4)

    const after = planChoiceMessage({ body: 'b', options: options(12), page: 4, source: 'dynamic' })

    if (after.kind !== 'list') throw new Error(`esperava lista, veio ${after.kind}`)
    expect(after.page).toBe(2)
    expect(after.hasMore).toBe(false)
    expect(after.rows.map((row) => row.id)).toEqual(['__back__:1', 'o9', 'o10', 'o11'])
  })

  test('lista que zera entre dois toques: plano vazio com a mensagem, sem lançar', () => {
    const plan = planChoiceMessage({ body: 'b', options: [], page: 3, source: 'dynamic' })
    expect(plan).toEqual({ body: WHATSAPP_MENU_NOTHING_TO_SHOW, kind: 'empty' })
  })

  test('página menor que 1 lança', () => {
    expect(() =>
      planChoiceMessage({ body: 'b', options: options(11), page: 0, source: 'dynamic' }),
    ).toThrow(WhatsAppMenuPolicyViolationError)
  })
})

describe('validateFlowGraphForWhatsApp (spec 144 T007)', () => {
  function graphWithMenu(node: Partial<FlowNodeData>): FlowGraphData {
    return {
      key: 'contract',
      label: 'Contrato',
      nodes: {
        menu: {
          fallbackMessage: 'Escolha uma opção.',
          id: 'menu',
          next: { byAnswer: {}, default: 'menu' },
          options: [],
          type: 'menu',
          ...node,
        },
      },
      startNodeId: 'menu',
      version: 1,
    }
  }

  test('o grafo raiz publicado hoje não tem violação', () => {
    expect(validateFlowGraphForWhatsApp(WHATSAPP_ROOT_FLOW)).toEqual([])
  })

  test('título com 20 graphemes e emoji cabe no botão', () => {
    const graph = graphWithMenu({ options: [['a', TITLE_20_WITH_EMOJI]] })

    expect(validateFlowGraphForWhatsApp(graph)).toEqual([])
  })

  test('título com 21 graphemes e emoji não cabe no botão', () => {
    const graph = graphWithMenu({ options: [['a', TITLE_21_WITH_EMOJI]] })

    expect(validateFlowGraphForWhatsApp(graph)).toEqual([
      {
        actual: 21,
        limit: WHATSAPP_CHOICE_LIMIT.buttonTitle,
        nodeId: 'menu',
        optionId: 'a',
        rule: 'title_too_long',
      },
    ])
  })

  test('botão sem emoji, título dentro do teto: só falta o emoji', () => {
    const graph = graphWithMenu({ options: [['a', TITLE_20_WITHOUT_EMOJI]] })

    expect(validateFlowGraphForWhatsApp(graph)).toEqual([
      { nodeId: 'menu', optionId: 'a', rule: 'missing_emoji' },
    ])
  })

  test('botão sem emoji e acima do teto: as duas violações, não só a primeira', () => {
    const graph = graphWithMenu({ options: [['a', TITLE_21_WITHOUT_EMOJI]] })

    const violations = validateFlowGraphForWhatsApp(graph)
    expect(violations).toHaveLength(2)
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'title_too_long' }),
        expect.objectContaining({ rule: 'missing_emoji' }),
      ]),
    )
  })

  test('lista (4 a 10 opções) não exige emoji', () => {
    const graph = graphWithMenu({
      options: [
        ['a', TITLE_20_WITHOUT_EMOJI],
        ['b', '📦 Com emoji'],
        ['c', 'Sem emoji também'],
        ['d', 'Quarta opção'],
      ],
    })

    expect(validateFlowGraphForWhatsApp(graph)).toEqual([])
  })

  test('id com acento ou espaço viola §7 do conversation-flow', () => {
    const graph = graphWithMenu({ options: [['fálar', '📦 Válido']] })

    expect(validateFlowGraphForWhatsApp(graph)).toEqual([
      { nodeId: 'menu', optionId: 'fálar', rule: 'invalid_option_id' },
    ])
  })

  test('nó de escolha sem fallbackMessage é violação', () => {
    const graph: FlowGraphData = {
      key: 'contract',
      label: 'Contrato',
      nodes: {
        menu: {
          id: 'menu',
          next: { byAnswer: {}, default: 'menu' },
          options: [['a', '🅰️ A']],
          type: 'menu',
        },
      },
      startNodeId: 'menu',
      version: 1,
    }

    expect(validateFlowGraphForWhatsApp(graph)).toEqual(
      expect.arrayContaining([{ nodeId: 'menu', rule: 'missing_fallback_message' }]),
    )
  })

  test('mais de 10 opções num nó estático é violação — não se aplica paginação a nó estático', () => {
    const graph = graphWithMenu({ options: options(11).map((option) => [option.id, option.title]) })

    expect(validateFlowGraphForWhatsApp(graph)).toEqual([
      {
        actual: 11,
        limit: WHATSAPP_CHOICE_LIMIT.listRows,
        nodeId: 'menu',
        rule: 'too_many_options',
      },
    ])
  })

  test('nó sem `next` que não é ação terminal explícita é violação', () => {
    const graph: FlowGraphData = {
      key: 'contract',
      label: 'Contrato',
      nodes: {
        condition: {
          conditionContextKey: 'k',
          conditionOperator: '==',
          conditionValue: 'v',
          id: 'condition',
          type: 'condition',
        },
      },
      startNodeId: 'condition',
      version: 1,
    }

    expect(validateFlowGraphForWhatsApp(graph)).toEqual([
      { nodeId: 'condition', rule: 'missing_exit' },
    ])
  })

  test('nó `action` sem `next` é terminal explícito — sem violação', () => {
    const graph: FlowGraphData = {
      key: 'contract',
      label: 'Contrato',
      nodes: { end: { directMessage: 'Fim.', id: 'end', type: 'action' } },
      startNodeId: 'end',
      version: 1,
    }

    expect(validateFlowGraphForWhatsApp(graph)).toEqual([])
  })
})

describe('parseMenuPageNavigation (spec 144 T007)', () => {
  test('__more__:N devolve N', () => {
    expect(parseMenuPageNavigation('__more__:3')).toBe(3)
  })

  test('__back__:N devolve N', () => {
    expect(parseMenuPageNavigation('__back__:1')).toBe(1)
  })

  test.each([undefined, 'menu', 'o0', '__more__:0', '__more__:-1', '__more__:abc'])(
    '%p não é navegação de página',
    (answer) => {
      expect(parseMenuPageNavigation(answer)).toBeUndefined()
    },
  )
})
