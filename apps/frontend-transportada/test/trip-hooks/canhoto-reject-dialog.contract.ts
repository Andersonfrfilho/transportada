/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.10: o diálogo de recusa do canhoto montado de verdade. Os dados dos casos são
 * sintéticos — nenhum e-mail, documento ou telefone real entra em teste.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { CanhotoRejectDialog } from '../../src/modules/trip/components/CanhotoRejectDialog.component'
import type { CanhotoRejectSubmission } from '../../src/modules/trip/components/CanhotoRejectDialog.component'

const REASON_LABEL = 'Motivo da recusa'
const NOTE_LABEL = 'Descreva o motivo'
const SUBMIT_LABEL = 'Recusar canhoto'
const OTHER_OPTION = 'Outro motivo'
const ILLEGIBLE_OPTION = 'Ilegível'
const MINIMUM_LENGTH = 20
const MAXIMUM_LENGTH = 500
const SYNTHETIC_EMAIL_NOTE = 'Fale com pessoa@exemplo.test sobre o canhoto'

const originalRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getBoundingClientRect',
)
const VISIBLE_ANCHOR_RECT = {
  bottom: 130,
  height: 30,
  left: 100,
  right: 300,
  top: 100,
  width: 200,
  x: 100,
  y: 100,
  toJSON: () => ({}),
} as DOMRect

let root: Root | undefined
let container: HTMLDivElement | undefined
let submissions: CanhotoRejectSubmission[] = []
let closeCalls = 0

type DialogOverrides = Readonly<{
  isOpen?: boolean
  isSubmitting?: boolean
  serverErrorCode?: string
}>

async function renderWith({
  isOpen = true,
  isSubmitting = false,
  serverErrorCode,
}: DialogOverrides = {}): Promise<void> {
  await act(async () => {
    root?.render(
      createElement(CanhotoRejectDialog, {
        isOpen,
        isSubmitting,
        onClose: () => {
          closeCalls += 1
        },
        onSubmit: (submission: CanhotoRejectSubmission) => {
          submissions.push(submission)
        },
        ...(serverErrorCode === undefined ? {} : { serverErrorCode }),
      }),
    )
    await Promise.resolve()
  })
}

async function renderDialog(serverErrorCode?: string): Promise<void> {
  // O happy-dom mede tudo como zero, e o Select fecha a lista quando o gatilho está fora da janela.
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => VISIBLE_ANCHOR_RECT,
  })
  submissions = []
  closeCalls = 0
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await renderWith(serverErrorCode === undefined ? {} : { serverErrorCode })
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]')
}

function noteField(): HTMLTextAreaElement | null {
  return document.querySelector(`textarea[aria-label="${NOTE_LABEL}"]`)
}

function alertText(): string {
  return document.querySelector('[role="alert"]')?.textContent ?? ''
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${text}`)
  return found
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
}

async function chooseReason(optionLabel: string): Promise<void> {
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${REASON_LABEL}"]`)
  if (trigger === null) throw new Error('REASON_TRIGGER_NOT_FOUND')
  // O happy-dom repete o clique do botão no <label> que o envolve e fecha a lista; o teclado abre.
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))
    await Promise.resolve()
  })
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (candidate) => candidate.textContent === optionLabel,
  )
  if (!(option instanceof HTMLElement)) throw new Error(`OPTION_NOT_FOUND:${optionLabel}`)
  await click(option)
}

async function typeNote(value: string): Promise<void> {
  const field = noteField()
  if (field === null) throw new Error('NOTE_FIELD_NOT_FOUND')
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

describe('CanhotoRejectDialog (spec 220 T7.10)', () => {
  afterEach(async () => {
    if (originalRectDescriptor !== undefined) {
      Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', originalRectDescriptor)
    }
    if (root !== undefined) act(() => root?.unmount())
    await new Promise((resolve) => setTimeout(resolve))
    container?.remove()
    root = undefined
    container = undefined
  })

  it('o campo livre só existe com o motivo outro', async () => {
    await renderDialog()
    expect(noteField()).toBe(null)

    await chooseReason(OTHER_OPTION)
    expect(noteField()).not.toBe(null)

    await chooseReason(ILLEGIBLE_OPTION)
    expect(noteField()).toBe(null)
  })

  it('motivo da lista fechada envia sem nota', async () => {
    await renderDialog()
    await click(buttonByText(SUBMIT_LABEL))
    expect(submissions).toEqual([{ reason: 'illegible' }])
  })

  it('o contador acompanha o texto e respeita os dois limites', async () => {
    await renderDialog()
    await chooseReason(OTHER_OPTION)

    await typeNote('a'.repeat(MINIMUM_LENGTH - 1))
    expect(document.body.textContent).toContain(`${MINIMUM_LENGTH - 1} / ${MAXIMUM_LENGTH}`)
    await click(buttonByText(SUBMIT_LABEL))
    expect(submissions).toHaveLength(0)
    expect(alertText()).toContain(String(MINIMUM_LENGTH))

    await typeNote('a'.repeat(MINIMUM_LENGTH))
    await click(buttonByText(SUBMIT_LABEL))
    expect(submissions).toHaveLength(1)

    await typeNote('a'.repeat(MAXIMUM_LENGTH))
    await click(buttonByText(SUBMIT_LABEL))
    expect(submissions).toHaveLength(2)
    expect(submissions[1]).toEqual({ note: 'a'.repeat(MAXIMUM_LENGTH), reason: 'other' })

    await typeNote('a'.repeat(MAXIMUM_LENGTH + 1))
    await click(buttonByText(SUBMIT_LABEL))
    expect(submissions).toHaveLength(2)
    expect(alertText()).toContain(String(MAXIMUM_LENGTH))
  })

  it('campo vazio diz que a descrição é obrigatória', async () => {
    await renderDialog()
    await chooseReason(OTHER_OPTION)
    await click(buttonByText(SUBMIT_LABEL))
    expect(submissions).toHaveLength(0)
    expect(alertText()).toContain('obrigat')
  })

  it('dado pessoal barra o envio antes de chamar o cliente', async () => {
    await renderDialog()
    await chooseReason(OTHER_OPTION)
    await typeNote(SYNTHETIC_EMAIL_NOTE)
    await click(buttonByText(SUBMIT_LABEL))
    expect(submissions).toHaveLength(0)
    expect(alertText()).toContain('dado pessoal')
  })

  it.each([
    ['CANHOTO_REVIEW_NOTE_PERSONAL_DATA', 'dado pessoal'],
    ['CANHOTO_REVIEW_NOTE_LENGTH', 'entre'],
    ['CANHOTO_REVIEW_NOTE_REQUIRED', 'obrigat'],
    ['CANHOTO_REVIEW_NOTE_NOT_ALLOWED', 'Só o motivo'],
    ['ALGUM_OUTRO_CODIGO', 'Não foi possível'],
  ])('o 400 %s do servidor vira mensagem', async (code, expected) => {
    await renderDialog(code)
    expect(alertText()).toContain(expected)
  })

  it('reabrir não traz de volta o motivo, a nota nem o erro da vez anterior', async () => {
    await renderDialog()
    await chooseReason(OTHER_OPTION)
    await typeNote(SYNTHETIC_EMAIL_NOTE)
    await click(buttonByText(SUBMIT_LABEL))
    expect(alertText()).toContain('dado pessoal')

    await renderWith({ isOpen: false })
    expect(dialog()).toBe(null)
    await renderWith()

    expect(noteField()).toBe(null)
    expect(alertText()).toBe('')
    await click(buttonByText(SUBMIT_LABEL))
    expect(submissions).toEqual([{ reason: 'illegible' }])
  })

  it('enquanto o envio está em curso, confirmar não aceita um segundo clique', async () => {
    await renderDialog()
    await renderWith({ isSubmitting: true })

    expect(buttonByText(SUBMIT_LABEL).disabled).toBe(true)
  })

  it('Esc fecha o diálogo', async () => {
    await renderDialog()
    await act(async () => {
      dialog()?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      await Promise.resolve()
    })
    expect(closeCalls).toBe(1)
  })
})
