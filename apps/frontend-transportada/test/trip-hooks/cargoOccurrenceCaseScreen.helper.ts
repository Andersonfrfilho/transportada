/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: os gestos da tratativa no detalhe do escritório — achar a avaria, listar as ações que ela
 * oferece, abrir o painel de uma ação, escrever o motivo e confirmar. Seletores por `data-*`: o texto do botão
 * pode mudar de redação, o contrato é sobre QUAL ação existe.
 */
import { expect } from 'bun:test'

import { click, byLabel } from './cargoReceivingHarness.helper'
import { pickOption, typeInArea } from './cargoOccurrenceScreen.helper'
import { settle, waitFor } from './renderHook.helper'

export const itemOf = (occurrenceId: string): HTMLElement => {
  const item = document.querySelector<HTMLElement>(`[data-occurrence-id="${occurrenceId}"]`)
  if (item === null) throw new Error(`OCCURRENCE_ITEM_NOT_FOUND:${occurrenceId}`)
  return item
}

export const caseButton = (occurrenceId: string, action: string): HTMLButtonElement | null =>
  itemOf(occurrenceId).querySelector<HTMLButtonElement>(`[data-case-action="${action}"]`)

/** As ações que a avaria oferece, na ordem em que aparecem na tela. */
export const offeredActions = (occurrenceId: string): string[] =>
  [...itemOf(occurrenceId).querySelectorAll('[data-case-action]')].map(
    (button) => button.getAttribute('data-case-action') ?? '',
  )

export const panelOf = (occurrenceId: string): HTMLElement | null =>
  itemOf(occurrenceId).querySelector<HTMLElement>('[data-case-panel]')

export const confirmButton = (occurrenceId: string): HTMLButtonElement => {
  const button = panelOf(occurrenceId)?.querySelector<HTMLButtonElement>('[data-case-confirm]')
  if (button === null || button === undefined) throw new Error('CASE_CONFIRM_NOT_FOUND')
  return button
}

export const noteField = (occurrenceId: string): HTMLTextAreaElement => {
  const field = panelOf(occurrenceId)?.querySelector<HTMLTextAreaElement>('textarea')
  if (field === null || field === undefined) throw new Error('CASE_NOTE_NOT_FOUND')
  return field
}

export const alertsOf = (occurrenceId: string): string =>
  [...itemOf(occurrenceId).querySelectorAll('[role="alert"]')]
    .map((alert) => alert.textContent ?? '')
    .join(' | ')

export const statusOf = (occurrenceId: string): string =>
  itemOf(occurrenceId).querySelector('[data-case-status]')?.textContent?.trim() ?? ''

export async function openPanel(input: { action: string; occurrenceId: string }): Promise<void> {
  const button = caseButton(input.occurrenceId, input.action)
  if (button === null) throw new Error(`CASE_BUTTON_NOT_FOUND:${input.action}`)
  await click(button)
}

export async function writeNote(input: { occurrenceId: string; text: string }): Promise<void> {
  await typeInArea(noteField(input.occurrenceId), input.text)
}

export async function confirm(occurrenceId: string): Promise<void> {
  await click(confirmButton(occurrenceId))
  await settle()
}

/** Clica a ação e, se ela pede confirmação, confirma — espera a leitura nova assentar. */
export async function runAction(input: {
  action: string
  note?: string
  occurrenceId: string
}): Promise<void> {
  await openPanel(input)
  if (input.note !== undefined)
    await writeNote({ occurrenceId: input.occurrenceId, text: input.note })
  await confirm(input.occurrenceId)
}

export async function waitForStatus(input: { occurrenceId: string; text: string }): Promise<void> {
  await waitFor(() => expect(statusOf(input.occurrenceId)).toBe(input.text))
}

export { byLabel, pickOption }
