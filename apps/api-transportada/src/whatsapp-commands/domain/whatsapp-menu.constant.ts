/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Tetos do Cloud API da Meta, medidos na doc oficial em 2026-09-11 (evidence.md § T007):
 * botões (`interactive-reply-buttons-messages`) e lista (`interactive-list-messages`).
 * O provider `@adatechnology/meta-whatsapp-provider@0.1.0` não valida nenhum deles — a Meta
 * recusa a mensagem inteira, e o cliente vê silêncio.
 */
export const WHATSAPP_CHOICE_LIMIT = {
  /** Corpo da mensagem. A doc de botões diz 1024; a de lista diz 4096 — usamos a mais restritiva. */
  body: 1024,
  /** Máximo de botões de resposta rápida numa mensagem. */
  buttons: 3,
  /** Rótulo do botão de resposta rápida. */
  buttonTitle: 20,
  /** Texto do botão que abre a lista (`buttonText`/CTA). */
  listButtonText: 20,
  /** Descrição de uma linha da lista. Não usado hoje — o `ChannelAdapterInterface` 0.1.0 não a expõe. */
  listRowDescription: 72,
  /** Título de uma linha da lista. */
  listRowTitle: 24,
  /** Linhas por lista, somando todas as seções. */
  listRows: 10,
  /** Título de uma seção da lista. Não usado hoje — enviamos uma seção só, sem título. */
  sectionTitle: 24,
} as const

/** conversation-flow.md §7: id de opção e de nó, sem acento, estável. */
export const WHATSAPP_MENU_OPTION_ID_PATTERN = /^[a-z0-9_]+$/

export const WHATSAPP_LIST_BUTTON_TEXT = 'Ver opções'

export const WHATSAPP_MENU_MORE_LABEL = '➡️ Mais'

export const WHATSAPP_MENU_BACK_LABEL = '⬅️ Voltar'

export const WHATSAPP_MENU_MORE_ID_PREFIX = '__more__:'

export const WHATSAPP_MENU_BACK_ID_PREFIX = '__back__:'

/**
 * Página 1 reserva uma linha para "➡️ Mais"; da página 2 em diante reserva também "⬅️ Voltar".
 * Nenhuma página passa de `WHATSAPP_CHOICE_LIMIT.listRows` linhas, navegação incluída.
 */
export const WHATSAPP_MENU_FIRST_PAGE_SIZE = 9

export const WHATSAPP_MENU_OTHER_PAGE_SIZE = 8
