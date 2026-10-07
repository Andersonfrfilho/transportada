/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1: o painel do calendário montado de verdade, e os gestos que os contratos repetem — clicar, digitar,
 * escolher numa lista. Dados sintéticos. Cada arquivo de DOM instala `stubVisibleLayout()`: o `Select` só abre
 * com ele (o DOM do teste devolve retângulos zerados).
 */
import { act, createElement } from 'react'
import { setSystemTime } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { BusinessCalendarPanel } from '@/modules/company-settings/components/BusinessCalendarPanel.component'

import {
  DOUBLE_CURRENT_YEAR,
  resetBusinessCalendarDouble,
} from './businessCalendarClientMocks.helper'
import { renderWithQueryClient, settle, waitFor, type RenderedComponent } from './renderHook.helper'

export const COMPANY_ID = 'company-1'
const SYSTEM_TIME = new Date(`${String(DOUBLE_CURRENT_YEAR)}-10-07T15:00:00.000Z`)

export type CalendarScenario = Readonly<{
  restore: () => void
  rendered: RenderedComponent | undefined
}>

let rendered: RenderedComponent | undefined
let restoreLayout: (() => void) | undefined

/** O DOM do teste devolve retângulos zerados e o `Select` fecha na hora uma camada "fora da janela". */
export function stubVisibleLayout(): () => void {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')
  const visibleRect: DOMRect = {
    bottom: 130,
    height: 30,
    left: 100,
    right: 300,
    toJSON: () => ({}),
    top: 100,
    width: 200,
    x: 100,
    y: 100,
  }
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => visibleRect,
    writable: true,
  })
  return () => {
    if (original !== undefined) {
      Object.defineProperty(Element.prototype, 'getBoundingClientRect', original)
    }
  }
}

export function startScenario(): void {
  resetBusinessCalendarDouble()
  setSystemTime(SYSTEM_TIME)
  window.history.replaceState({}, '', '/company-settings')
  restoreLayout = stubVisibleLayout()
}

export async function endScenario(): Promise<void> {
  rendered?.unmount()
  rendered = undefined
  restoreLayout?.()
  restoreLayout = undefined
  setSystemTime()
  await settle()
}

export async function mountPanel(canManage = true): Promise<void> {
  rendered = await renderWithQueryClient(
    createElement(BusinessCalendarPanel, { canManage, companyId: COMPANY_ID }),
  )
  await settle()
}

export function text(): string {
  return document.body.textContent ?? ''
}

/** A seção pelo título dela: os três blocos repetem rótulos como "Nome" e "Recorrência". */
export function sectionOf(heading: string): HTMLElement {
  const title = [...document.querySelectorAll('h3')].find(
    (candidate) => candidate.textContent?.trim() === heading,
  )
  const section = title?.closest('section')
  if (section === null || section === undefined) throw new Error(`SECTION_NOT_FOUND:${heading}`)
  return section
}

export function buttonIn(scope: ParentNode, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${label}`)
  return found
}

export function hasButtonIn(scope: ParentNode, label: string): boolean {
  return [...scope.querySelectorAll('button')].some(
    (candidate) =>
      candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label,
  )
}

export function inputIn(scope: ParentNode, label: string): HTMLInputElement {
  const found = scope.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (found === null) throw new Error(`INPUT_NOT_FOUND:${label}`)
  return found
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
  await settle()
}

export async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

/** Abre a lista pelo gatilho (`aria-label`) e escolhe a opção que começa com o texto dado. */
export async function choose(
  input: Readonly<{ option: string; scope: ParentNode; trigger: string }>,
): Promise<void> {
  await waitFor(() => {
    const trigger = input.scope.querySelector<HTMLButtonElement>(
      `button[aria-label="${input.trigger}"]`,
    )
    if (trigger === null || trigger.disabled) throw new Error(`TRIGGER_NOT_READY:${input.trigger}`)
  })
  const trigger = input.scope.querySelector<HTMLButtonElement>(
    `button[aria-label="${input.trigger}"]`,
  )
  if (trigger === null) throw new Error(`TRIGGER_NOT_FOUND:${input.trigger}`)
  await click(trigger)
  await waitFor(() => {
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    if (options.length === 0) throw new Error('OPTIONS_NOT_OPEN')
  })
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) =>
    (candidate.textContent ?? '').trim().startsWith(input.option),
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${input.option}`)
  await click(option)
}

export function callsOf(prefix: string, calls: readonly string[]): readonly string[] {
  return calls.filter((call) => call.startsWith(prefix))
}

export async function waitForText(expected: string): Promise<void> {
  await waitFor(() => {
    if (!text().includes(expected)) throw new Error(`TEXT_NOT_FOUND:${expected}`)
  })
}

export function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]')
}

export function rowsOf(section: HTMLElement): readonly HTMLTableRowElement[] {
  return [...section.querySelectorAll<HTMLTableRowElement>('tbody tr')]
}
