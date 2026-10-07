/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3: as duas telas do recebimento (celular do separador e detalhe do escritório) montadas com o
 * servidor dublado da chegada E o da avaria, e os gestos que os contratos repetem: abrir o formulário, escolher
 * o tipo e a foto, digitar a observação. Dados sintéticos.
 */
import { createElement } from 'react'
import { act } from 'react'
import { expect } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoArrivalDetailScreen } from '@/modules/cargo-receiving/components/CargoArrivalDetailScreen.component'
import { CargoSeparationScreen } from '@/modules/cargo-receiving/components/CargoSeparationScreen.component'

import {
  ARRIVAL_ID,
  buildDetail,
  buildDocument,
  documentIdOf,
} from '../fixtures/cargoReceiving.fixture'
import { windowOpenDueAt } from '../fixtures/cargoOccurrence.fixture'
import {
  chooseFile,
  installCargoOccurrenceDouble,
  pngFile,
  type CargoOccurrenceDouble,
} from './cargoOccurrenceHarness.helper'
import {
  byLabel,
  click,
  installCargoReceivingDouble,
  resetLocation,
  type CargoReceivingDouble,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

type Access = Readonly<{ canManage?: boolean; canResolve?: boolean }>

/** Duas notas na doca: 1001 recebida (aceita avaria) e 1002 esperada; 1003 separada; 1004 em viagem viva. */
export const OCCURRENCE_DOCUMENTS = [
  buildDocument({
    number: '1001',
    receivedAt: '2026-10-03T13:00:00.000Z',
    separationState: 'received',
  }),
  buildDocument({ number: '1002' }),
  buildDocument({
    number: '1003',
    receivedAt: '2026-10-03T13:00:00.000Z',
    separatedAt: '2026-10-03T13:30:00.000Z',
    separationState: 'separated',
  }),
  buildDocument({
    isInLiveTrip: true,
    number: '1004',
    receivedAt: '2026-10-03T13:00:00.000Z',
    separationState: 'received',
  }),
]

export type MountOptions = Access &
  Readonly<{
    arrival?: Partial<Parameters<typeof buildDetail>[0]>
    occurrence?: Partial<CargoOccurrenceDouble>
    receiving?: Partial<CargoReceivingDouble>
  }>

async function mountScreen(
  screen: typeof CargoSeparationScreen | typeof CargoArrivalDetailScreen,
  options: MountOptions,
) {
  const { canManage = true, canResolve = false } = options
  resetLocation(`/recebimento/${ARRIVAL_ID}`)
  const receiving = installCargoReceivingDouble({
    server: buildDetail({
      documents: OCCURRENCE_DOCUMENTS,
      id: ARRIVAL_ID,
      separationDueAt: windowOpenDueAt(),
      ...options.arrival,
    }),
    ...options.receiving,
  })
  const occurrence = installCargoOccurrenceDouble(options.occurrence)
  const rendered = await renderWithQueryClient(
    createElement(screen, { arrivalId: ARRIVAL_ID, canManage, canResolve }),
  )
  await waitFor(() => expect(document.body.textContent).toContain('Alfa Indústria Fictícia'))
  await settle()
  return { occurrence, receiving, rendered }
}

export const mountSeparation = (options: MountOptions = {}) =>
  mountScreen(CargoSeparationScreen, options)
export const mountOffice = (options: MountOptions = {}) =>
  mountScreen(CargoArrivalDetailScreen, options)

export const text = (): string => document.body.textContent ?? ''
export const occurrenceButton = (number: number) =>
  document.querySelector<HTMLButtonElement>(
    `[aria-label="Registrar avaria — NF ${String(number)}"]`,
  )
export const markButton = (number: number) =>
  document.querySelector<HTMLButtonElement>(
    `[aria-label="Devolver ao contratante — NF ${String(number)}"]`,
  )
export const completeButton = (number: number) =>
  document.querySelector<HTMLButtonElement>(
    `[aria-label="Concluir devolução — NF ${String(number)}"]`,
  )
export const unmarkButton = (number: number) =>
  document.querySelector<HTMLButtonElement>(
    `[aria-label="Desfazer devolução — NF ${String(number)}"]`,
  )
export const rowOf = (number: number): HTMLElement =>
  document.querySelector(`[data-document-id="${documentIdOf(number)}"]`) as HTMLElement
export const dialog = (): HTMLElement | null => document.querySelector('[role="dialog"]')

/** Abre o formulário da avaria da nota e espera os tipos e os itens carregarem. */
export async function openOccurrenceForm(number: number): Promise<void> {
  const button = occurrenceButton(number)
  if (button === null) throw new Error(`OCCURRENCE_BUTTON_NOT_FOUND:${String(number)}`)
  await click(button)
  await waitFor(() =>
    expect(document.querySelectorAll('[data-product-code]').length).toBeGreaterThan(0),
  )
}

export async function pickOption(input: { label: string; option: string }): Promise<void> {
  await click(byLabel(input.label))
  const option = [...document.querySelectorAll('[role="option"]')].find((item) =>
    item.textContent?.trim().startsWith(input.option),
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${input.option}`)
  await click(option as HTMLElement)
}

export async function typeInArea(
  area: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): Promise<void> {
  const prototype = area instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const descriptor = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(area, value)
    area.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

export const noteArea = (): HTMLTextAreaElement =>
  document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement

export async function markItem(code: string): Promise<void> {
  const row = document.querySelector(`[data-product-code="${code}"]`) as HTMLElement
  await click(row.querySelector('input[type="checkbox"]') as HTMLInputElement)
}

export async function attachPhoto(file: File = pngFile()): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="file"]')
  if (input === null) throw new Error('PHOTO_INPUT_NOT_FOUND')
  await chooseFile(input, file)
}

export async function submitOccurrence(): Promise<void> {
  const submit = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (button) => button.textContent?.trim() === 'Registrar avaria',
  )
  if (submit === undefined) throw new Error('SUBMIT_NOT_FOUND')
  await click(submit)
  await settle()
}

/** O formulário completo e válido: tipo, um item com contagem e foto. */
export async function fillValidOccurrence(): Promise<void> {
  await pickOption({ label: 'Tipo da ocorrência', option: 'Item avariado na chegada' })
  await markItem('P-100')
  await attachPhoto()
}

/**
 * O DOM de teste devolve retângulos zerados, e o `Select` fecha na hora uma camada cujo gatilho "está fora da
 * janela" (`useFloatingLayer`): sem este remendo a lista de tipos só abre quando outra suíte já o instalou, e o
 * contrato passaria a depender da ordem. Devolve a função que o desfaz.
 */
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
