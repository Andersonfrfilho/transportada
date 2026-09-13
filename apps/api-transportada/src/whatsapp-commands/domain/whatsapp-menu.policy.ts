/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData, FlowNodeData } from '@adatechnology/meta-whatsapp-contracts'

import {
  WHATSAPP_CHOICE_LIMIT,
  WHATSAPP_LIST_BUTTON_TEXT,
  WHATSAPP_MENU_BACK_ID_PREFIX,
  WHATSAPP_MENU_BACK_LABEL,
  WHATSAPP_MENU_FIRST_PAGE_SIZE,
  WHATSAPP_MENU_MORE_ID_PREFIX,
  WHATSAPP_MENU_MORE_LABEL,
  WHATSAPP_MENU_NOTHING_TO_SHOW,
  WHATSAPP_MENU_OPTION_ID_PATTERN,
  WHATSAPP_MENU_OTHER_PAGE_SIZE,
} from './whatsapp-menu.constant.js'
import { WhatsAppMenuPolicyViolationError } from './whatsapp-menu.error.js'

export type WhatsAppMenuOption = {
  readonly id: string
  readonly title: string
}

/**
 * `graph`: opções de um nó estático do grafo — validadas na publicação, nunca paginadas em
 * runtime. `dynamic`: lista vinda do banco (viagens, notas, emitentes) — pagina acima do teto e
 * trunca título grande em vez de recusar.
 */
export type WhatsAppMenuOptionSource = 'graph' | 'dynamic'

export type WhatsAppChoicePlanInput = {
  readonly body: string
  readonly options: readonly WhatsAppMenuOption[]
  readonly page?: number
  readonly source: WhatsAppMenuOptionSource
}

export type WhatsAppButtonChoicePlan = {
  readonly body: string
  readonly buttons: readonly WhatsAppMenuOption[]
  readonly kind: 'buttons'
}

export type WhatsAppListChoicePlan = {
  readonly body: string
  readonly buttonText: string
  readonly hasMore: boolean
  readonly kind: 'list'
  readonly page: number
  readonly rows: readonly WhatsAppMenuOption[]
}

/** T020 (B3): a lista dinâmica relida veio vazia; quem envia manda o texto e volta um menu. */
export type WhatsAppEmptyChoicePlan = {
  readonly body: string
  readonly kind: 'empty'
}

export type WhatsAppChoicePlan =
  | WhatsAppButtonChoicePlan
  | WhatsAppEmptyChoicePlan
  | WhatsAppListChoicePlan

const graphemeSegmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })

/** Grapheme, não `.length`: emoji com variation selector ou ZWJ é um caractere para quem lê. */
export function countMenuGraphemes(text: string): number {
  return [...graphemeSegmenter.segment(text)].length
}

const EMOJI_PATTERN = /^\p{Extended_Pictographic}/u

function startsWithEmoji(title: string): boolean {
  const [first] = graphemeSegmenter.segment(title)
  return first !== undefined && EMOJI_PATTERN.test(first.segment)
}

function truncateMenuTitle(title: string, limit: number): string {
  const graphemes = [...graphemeSegmenter.segment(title)].map((entry) => entry.segment)
  if (graphemes.length <= limit) return title
  return `${graphemes.slice(0, Math.max(limit - 1, 0)).join('')}…`
}

/**
 * conversation-flow.md §7: `__more__:N`/`__back__:N` são ids de sistema, nunca de opção autorada
 * — não passam pelo padrão de id do §7 nem contam como resposta inválida (D8 é sobre texto livre).
 */
export function parseMenuPageNavigation(answer: string | undefined): number | undefined {
  if (answer === undefined) return undefined

  const prefix = answer.startsWith(WHATSAPP_MENU_MORE_ID_PREFIX)
    ? WHATSAPP_MENU_MORE_ID_PREFIX
    : answer.startsWith(WHATSAPP_MENU_BACK_ID_PREFIX)
      ? WHATSAPP_MENU_BACK_ID_PREFIX
      : undefined
  if (prefix === undefined) return undefined

  const page = Number(answer.slice(prefix.length))
  return Number.isInteger(page) && page > 0 ? page : undefined
}

function capTitle(
  option: WhatsAppMenuOption,
  limit: number,
  source: WhatsAppMenuOptionSource,
): WhatsAppMenuOption {
  const actual = countMenuGraphemes(option.title)
  if (actual <= limit) return option

  if (source === 'graph') {
    throw new WhatsAppMenuPolicyViolationError({
      actual,
      limit,
      optionId: option.id,
      rule: 'title_too_long',
    })
  }

  return { id: option.id, title: truncateMenuTitle(option.title, limit) }
}

/**
 * Traduz um corpo + opções no formato do canal — nunca truncando um nó estático em silêncio: título
 * grande de nó estático é bug de publicação (a validação deveria ter pego antes), e vira erro alto,
 * não mensagem quebrada na Meta. Só opção `dynamic` passa por truncamento e paginação.
 */
export function planChoiceMessage(input: WhatsAppChoicePlanInput): WhatsAppChoicePlan {
  const { body, options, source } = input
  if (source === 'dynamic' && options.length === 0) {
    return { body: WHATSAPP_MENU_NOTHING_TO_SHOW, kind: 'empty' }
  }

  if (options.length <= WHATSAPP_CHOICE_LIMIT.buttons) {
    return {
      body,
      buttons: options.map((option) => capTitle(option, WHATSAPP_CHOICE_LIMIT.buttonTitle, source)),
      kind: 'buttons',
    }
  }

  if (options.length <= WHATSAPP_CHOICE_LIMIT.listRows) {
    return {
      body,
      buttonText: WHATSAPP_LIST_BUTTON_TEXT,
      hasMore: false,
      kind: 'list',
      page: 1,
      rows: options.map((option) => capTitle(option, WHATSAPP_CHOICE_LIMIT.listRowTitle, source)),
    }
  }

  if (source === 'graph') {
    throw new WhatsAppMenuPolicyViolationError({
      actual: options.length,
      limit: WHATSAPP_CHOICE_LIMIT.listRows,
      rule: 'too_many_options',
    })
  }

  return planDynamicListPage({ body, options, page: input.page ?? 1 })
}

/** Só chamada acima do teto de linhas: a primeira página leva 9, as seguintes 8 cada. */
function countDynamicListPages(optionCount: number): number {
  const beyondFirst = Math.max(0, optionCount - WHATSAPP_MENU_FIRST_PAGE_SIZE)
  return 1 + Math.ceil(beyondFirst / WHATSAPP_MENU_OTHER_PAGE_SIZE)
}

function planDynamicListPage(input: {
  readonly body: string
  readonly options: readonly WhatsAppMenuOption[]
  readonly page: number
}): WhatsAppListChoicePlan {
  const { body, options } = input
  if (input.page < 1) throw new WhatsAppMenuPolicyViolationError({ rule: 'invalid_page' })

  // T020 (B3): a página gravada no `context` pode apontar além de uma lista que encolheu.
  const page = Math.min(input.page, countDynamicListPages(options.length))
  const offset =
    page === 1 ? 0 : WHATSAPP_MENU_FIRST_PAGE_SIZE + (page - 2) * WHATSAPP_MENU_OTHER_PAGE_SIZE
  const size = page === 1 ? WHATSAPP_MENU_FIRST_PAGE_SIZE : WHATSAPP_MENU_OTHER_PAGE_SIZE
  const slice = options.slice(offset, offset + size)

  const hasMore = offset + slice.length < options.length
  const rows: WhatsAppMenuOption[] = []
  if (page > 1) {
    rows.push({ id: `${WHATSAPP_MENU_BACK_ID_PREFIX}${page - 1}`, title: WHATSAPP_MENU_BACK_LABEL })
  }
  for (const option of slice)
    rows.push(capTitle(option, WHATSAPP_CHOICE_LIMIT.listRowTitle, 'dynamic'))
  if (hasMore) {
    rows.push({ id: `${WHATSAPP_MENU_MORE_ID_PREFIX}${page + 1}`, title: WHATSAPP_MENU_MORE_LABEL })
  }

  return { body, buttonText: WHATSAPP_LIST_BUTTON_TEXT, hasMore, kind: 'list', page, rows }
}

export type WhatsAppFlowGraphViolationRule =
  | 'invalid_option_id'
  | 'missing_emoji'
  | 'missing_exit'
  | 'missing_fallback_message'
  | 'title_too_long'
  | 'too_many_options'

export type WhatsAppFlowGraphViolation = {
  readonly actual?: number
  readonly limit?: number
  readonly nodeId: string
  readonly optionId?: string
  readonly rule: WhatsAppFlowGraphViolationRule
}

function isChoiceGraphNode(node: FlowNodeData): boolean {
  return node.type === 'menu' || node.questionType === 'choice'
}

/**
 * Publicação de grafo: título acima do teto do formato, opção sem emoji em nó de ≤3, id fora de
 * `^[a-z0-9_]+$`, nó de escolha sem `fallbackMessage`, mais de 10 opções (não pagina nó estático) e
 * nó sem saída que não seja ação terminal. Devolve todas as violações de uma vez, não a primeira.
 */
export function validateFlowGraphForWhatsApp(
  graph: FlowGraphData,
): readonly WhatsAppFlowGraphViolation[] {
  const violations: WhatsAppFlowGraphViolation[] = []
  for (const node of Object.values(graph.nodes)) violations.push(...validateFlowNode(node))
  return violations
}

function validateFlowNode(node: FlowNodeData): WhatsAppFlowGraphViolation[] {
  const violations: WhatsAppFlowGraphViolation[] = []
  const options = node.options ?? []

  if (isChoiceGraphNode(node)) {
    if (node.fallbackMessage === undefined || node.fallbackMessage.trim() === '') {
      violations.push({ nodeId: node.id, rule: 'missing_fallback_message' })
    }
    violations.push(...validateChoiceOptions(node.id, options))
  }

  /** Nó `action` termina por si (`directMessage`/FlowAction); os demais precisam de `next`. */
  if (node.next === undefined && node.type !== 'action') {
    violations.push({ nodeId: node.id, rule: 'missing_exit' })
  }

  return violations
}

function validateChoiceOptions(
  nodeId: string,
  options: readonly [string, string][],
): WhatsAppFlowGraphViolation[] {
  const violations: WhatsAppFlowGraphViolation[] = []

  if (options.length > WHATSAPP_CHOICE_LIMIT.listRows) {
    violations.push({
      actual: options.length,
      limit: WHATSAPP_CHOICE_LIMIT.listRows,
      nodeId,
      rule: 'too_many_options',
    })
    return violations
  }

  const isButtons = options.length <= WHATSAPP_CHOICE_LIMIT.buttons
  const titleLimit = isButtons
    ? WHATSAPP_CHOICE_LIMIT.buttonTitle
    : WHATSAPP_CHOICE_LIMIT.listRowTitle
  for (const [optionId, title] of options) {
    if (!WHATSAPP_MENU_OPTION_ID_PATTERN.test(optionId)) {
      violations.push({ nodeId, optionId, rule: 'invalid_option_id' })
    }

    const actual = countMenuGraphemes(title)
    if (actual > titleLimit) {
      violations.push({ actual, limit: titleLimit, nodeId, optionId, rule: 'title_too_long' })
    }

    if (isButtons && !startsWithEmoji(title)) {
      violations.push({ nodeId, optionId, rule: 'missing_emoji' })
    }
  }

  return violations
}
