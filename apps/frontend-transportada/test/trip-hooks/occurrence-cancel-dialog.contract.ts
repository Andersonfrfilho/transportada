/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 235 T3.1 (RF3, CA04): o diálogo de cancelamento montado de verdade, com a API dublada. Dados
 * sintéticos — o motivo digitado nunca pode aparecer em console.
 */
import { act, createElement } from 'react'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OCCURRENCE_CORRECTION_ERROR } from '@/modules/trip/shared/occurrence.constant'
import type { CancelTripOccurrenceInput } from '@/modules/trip/shared/trip.types'

import { DETAIL_FIXTURE_IDS } from '../fixtures/tripOccurrenceDetail.fixture'
import {
  buttonByText,
  click,
  DetailHarness,
  installServerDouble,
} from './occurrenceCorrectionHarness.helper'
import { tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const CANCEL_BUTTON = 'Cancelar ocorrência'
const CONFIRM_BUTTON = 'Confirmar cancelamento'
const REASON_LABEL = 'Motivo do cancelamento'
const SYNTHETIC_REASON = 'Lançada na nota errada pelo operador sintético'
const REQUIRED_MESSAGE = 'Escreva o motivo do cancelamento para confirmar.'
const TOO_LONG_MESSAGE =
  'O motivo do cancelamento passa de 500 caracteres. Encurte o texto e confirme de novo.'

const pending: Array<() => void> = []

/** O happy-dom não remove o portal de um diálogo aberto ao desmontar: fecha antes, como o usuário. */
async function closeDialogIfOpen(): Promise<void> {
  if (document.querySelector('[role="dialog"]') === null) return
  await act(async () => {
    document
      .querySelector('[role="presentation"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    await Promise.resolve()
  })
}

afterEach(() => {
  while (pending.length > 0) pending.pop()?.()
})

function reasonField(): HTMLTextAreaElement {
  const field = document.querySelector('textarea')
  if (field === null) throw new Error('REASON_FIELD_NOT_FOUND')
  return field
}

async function typeReason(value: string): Promise<void> {
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  await act(async () => {
    valueDescriptor?.set?.call(reasonField(), value)
    reasonField().dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

async function openDialog(): Promise<HTMLButtonElement> {
  const rendered = await renderWithQueryClient(createElement(DetailHarness))
  pending.push(rendered.unmount)
  await waitFor(() => expect(document.querySelector('ul[aria-label="itens"]')).not.toBeNull())
  const trigger = buttonByText(CANCEL_BUTTON)
  trigger.focus()
  await click(trigger)
  await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  return trigger
}

function installCancelDouble(
  cancelImplementation?: (input: CancelTripOccurrenceInput) => Promise<never>,
): CancelTripOccurrenceInput[] {
  const calls: CancelTripOccurrenceInput[] = []
  installServerDouble()
  fakes.tripClient = {
    ...fakes.tripClient,
    cancelTripOccurrence: (input) => {
      calls.push(input)
      return cancelImplementation?.(input) ?? Promise.resolve({} as never)
    },
  }
  return calls
}

describe('diálogo de cancelamento da ocorrência (spec 235 T3.1)', () => {
  test('o motivo tem rótulo associado e o diálogo é modal e nomeado', async () => {
    installCancelDouble()
    await openDialog()
    const dialog = document.querySelector('[role="dialog"]')
    const label = document.querySelector('label')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(
      document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '')?.textContent,
    ).toBe('Cancelar esta ocorrência')
    expect(label?.textContent).toBe(REASON_LABEL)
    expect(label?.getAttribute('for')).toBe(reasonField().id)
    expect(reasonField().getAttribute('maxlength')).toBe('500')
    await closeDialogIfOpen()
  })

  test('CA04: confirmar fica desabilitado com motivo vazio e só com espaços, e habilita com texto', async () => {
    const calls = installCancelDouble()
    await openDialog()
    expect(buttonByText(CONFIRM_BUTTON).disabled).toBe(true)

    await typeReason('   \t  ')
    expect(buttonByText(CONFIRM_BUTTON).disabled).toBe(true)
    await click(buttonByText(CONFIRM_BUTTON))
    expect(calls).toHaveLength(0)

    await typeReason(SYNTHETIC_REASON)
    expect(buttonByText(CONFIRM_BUTTON).disabled).toBe(false)
    await closeDialogIfOpen()
  })

  test('confirmar manda o motivo com trim, uma vez, e fecha o diálogo', async () => {
    const calls = installCancelDouble()
    await openDialog()
    await typeReason(`  ${SYNTHETIC_REASON}  `)
    await click(buttonByText(CONFIRM_BUTTON))
    await settle()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      documentId: DETAIL_FIXTURE_IDS.documentId,
      idempotencyKey: expect.any(String) as unknown as string,
      occurrenceId: DETAIL_FIXTURE_IDS.occurrenceId,
      reason: SYNTHETIC_REASON,
      tripId: expect.any(String) as unknown as string,
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  test('o motivo digitado não vai para o console', async () => {
    const spies = (['debug', 'error', 'info', 'log', 'warn'] as const).map((level) =>
      spyOn(console, level).mockImplementation(() => undefined),
    )
    installCancelDouble()
    await openDialog()
    await typeReason(SYNTHETIC_REASON)
    await click(buttonByText(CONFIRM_BUTTON))
    await settle()
    const printed = spies.flatMap((spy): string[] =>
      spy.mock.calls.map((args: unknown[]) => args.map(String).join(' ')),
    )
    spies.forEach((spy) => spy.mockRestore())
    expect(printed.filter((line) => line.includes(SYNTHETIC_REASON))).toEqual([])
  })

  for (const [label, code, text] of [
    [
      'motivo obrigatório (400)',
      OCCURRENCE_CORRECTION_ERROR.CANCELLATION_REASON_REQUIRED,
      REQUIRED_MESSAGE,
    ],
    [
      'motivo longo demais (400)',
      OCCURRENCE_CORRECTION_ERROR.CANCELLATION_REASON_TOO_LONG,
      TOO_LONG_MESSAGE,
    ],
  ] as const) {
    test(`recusa do servidor, ${label}: mostra a mensagem própria e mantém o diálogo`, async () => {
      installCancelDouble(() => Promise.reject(new Error(code)))
      await openDialog()
      await typeReason(SYNTHETIC_REASON)
      await click(buttonByText(CONFIRM_BUTTON))
      await settle()
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(text)
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      await closeDialogIfOpen()
    })
  }

  test('abre com o foco no campo do motivo', async () => {
    installCancelDouble()
    await openDialog()
    expect(document.activeElement === reasonField()).toBe(true)
    await closeDialogIfOpen()
  })

  test('com o cancelamento em andamento, nem Escape nem o X fecham o diálogo', async () => {
    let release: () => void = () => undefined
    const calls = installCancelDouble(
      () =>
        new Promise<never>((resolve) => {
          release = () => resolve({} as never)
        }),
    )
    await openDialog()
    await typeReason(SYNTHETIC_REASON)
    await click(buttonByText(CONFIRM_BUTTON))
    await settle()
    expect(calls).toHaveLength(1)

    await act(async () => {
      document
        .querySelector('[role="presentation"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    const closeButton = document.querySelector<HTMLButtonElement>('button[aria-label="Fechar"]')
    expect(closeButton?.disabled).toBe(true)
    if (closeButton !== null) await click(closeButton)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    release()
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  test('Voltar fecha o diálogo e devolve o foco ao botão que abriu', async () => {
    installCancelDouble()
    const trigger = await openDialog()
    await click(buttonByText('Voltar'))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  test('Escape fecha o diálogo e devolve o foco ao botão que abriu', async () => {
    installCancelDouble()
    const trigger = await openDialog()
    await act(async () => {
      document
        .querySelector('[role="presentation"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      await Promise.resolve()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  test('Tab no último controle volta ao primeiro: o foco fica preso no diálogo', async () => {
    installCancelDouble()
    await openDialog()
    await typeReason(SYNTHETIC_REASON)
    const last = buttonByText(CONFIRM_BUTTON)
    last.focus()
    await act(async () => {
      last.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }))
      await Promise.resolve()
    })
    expect(document.activeElement).toBe(document.querySelector('button[aria-label="Fechar"]'))
    await closeDialogIfOpen()
  })
})
