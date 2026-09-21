/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T8c (ADR-0067), revisão do code-reviewer: `TripCloseDialog` não tinha cobertura
 * nenhuma. Precisa de DOM de verdade (não é lógica pura) porque o que se prova é o que o
 * `useModalDialog` monta e o que sobrevive a um erro do servidor sem fechar o diálogo — por isso
 * vive na suíte com DOM (`test:hooks`), não na principal.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { TripCloseDialog } from '../../src/modules/trip/components/TripCloseDialog.component'

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

/**
 * `TripCloseDialog` monta por `createPortal(..., document.body)` — o conteúdo nasce **fora** de
 * `container`, como irmão dele em `document.body`. As buscas abaixo leem `document.body` de
 * propósito, não o `container` do `createRoot`.
 */
async function renderDialog(props: {
  readonly isOpen: boolean
  readonly isSubmitting: boolean
  readonly onClose: () => void
  readonly onSubmit: (reason: null | string) => void
  readonly openDocumentCount: number
}): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(TripCloseDialog, props))
    await Promise.resolve()
  })
}

async function rerenderDialog(props: {
  readonly isOpen: boolean
  readonly isSubmitting: boolean
  readonly onClose: () => void
  readonly onSubmit: (reason: null | string) => void
  readonly openDocumentCount: number
}): Promise<void> {
  await act(async () => {
    root?.render(createElement(TripCloseDialog, props))
    await Promise.resolve()
  })
}

function reasonInput(): HTMLInputElement {
  const input = document.body.querySelector('input')
  if (input === null) throw new Error('REASON_INPUT_NOT_FOUND')
  return input
}

function confirmButton(): HTMLButtonElement {
  const buttons = Array.from(document.body.querySelectorAll('button'))
  const confirm = buttons.find((button) => button.textContent?.includes('Encerrar viagem'))
  if (confirm === undefined) throw new Error('CONFIRM_BUTTON_NOT_FOUND')
  return confirm
}

/**
 * React substitui o `set` nativo de `.value` por um rastreador próprio, para saber se um `input`
 * disparado depois é uma mudança real — atribuir `input.value = x` direto passa pelo rastreador e
 * o `input` sintético é ignorado. Chamar o `set` do protótipo nativo é o contorno padrão (o mesmo
 * do `@testing-library/user-event`). `unbound-method` dispara em falso aqui: o acessor nunca lê
 * `this` fora do `Reflect.apply` abaixo.
 */
// eslint-disable-next-line @typescript-eslint/unbound-method
const NATIVE_INPUT_VALUE_SETTER = Object.getOwnPropertyDescriptor(
  globalThis.HTMLInputElement.prototype,
  'value',
)?.set

async function typeReason(value: string): Promise<void> {
  const input = reasonInput()
  await act(async () => {
    if (NATIVE_INPUT_VALUE_SETTER !== undefined) {
      Reflect.apply(NATIVE_INPUT_VALUE_SETTER, input, [value])
    }
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

describe('TripCloseDialog (spec 156 T8c)', () => {
  it('com nota em aberto, exige motivo antes de liberar o confirmar', async () => {
    const submitted: (null | string)[] = []
    await renderDialog({
      isOpen: true,
      isSubmitting: false,
      onClose: () => {},
      onSubmit: (reason) => submitted.push(reason),
      openDocumentCount: 2,
    })

    expect(confirmButton().disabled).toBe(true)

    await typeReason('Canhotos recebidos no escritório')
    expect(confirmButton().disabled).toBe(false)

    await act(async () => {
      confirmButton().click()
      await Promise.resolve()
    })
    expect(submitted).toEqual(['Canhotos recebidos no escritório'])
  })

  it('sem nota em aberto, o confirmar já nasce liberado e envia null sem motivo', async () => {
    const submitted: (null | string)[] = []
    await renderDialog({
      isOpen: true,
      isSubmitting: false,
      onClose: () => {},
      onSubmit: (reason) => submitted.push(reason),
      openDocumentCount: 0,
    })

    expect(confirmButton().disabled).toBe(false)

    await act(async () => {
      confirmButton().click()
      await Promise.resolve()
    })
    expect(submitted).toEqual([null])
  })

  it('espaço em branco não conta como motivo', async () => {
    await renderDialog({
      isOpen: true,
      isSubmitting: false,
      onClose: () => {},
      onSubmit: () => {},
      openDocumentCount: 1,
    })

    await typeReason('   ')
    expect(confirmButton().disabled).toBe(true)
  })

  /**
   * O achado do code-reviewer: fechar o diálogo **antes** do `mutate` responder perdia o motivo
   * digitado assim que o 422 chegava. `TripDetail.component.tsx` só fecha (`isOpen: false`) no
   * `onSuccess` — enquanto `isOpen` continua `true`, o texto tem de sobreviver a uma nova
   * renderização (o efeito que limpa o campo só dispara na abertura, não a cada render).
   */
  it('mantém o motivo digitado enquanto o diálogo continua aberto após uma falha', async () => {
    await renderDialog({
      isOpen: true,
      isSubmitting: false,
      onClose: () => {},
      onSubmit: () => {},
      openDocumentCount: 1,
    })

    await typeReason('Canhotos recebidos no escritório')

    // Simula o componente pai re-renderizando com `isSubmitting: true` e depois `false` de novo,
    // sem nunca soltar `isOpen` — o caminho real de um envio que falhou.
    await rerenderDialog({
      isOpen: true,
      isSubmitting: true,
      onClose: () => {},
      onSubmit: () => {},
      openDocumentCount: 1,
    })
    await rerenderDialog({
      isOpen: true,
      isSubmitting: false,
      onClose: () => {},
      onSubmit: () => {},
      openDocumentCount: 1,
    })

    expect(reasonInput().value).toBe('Canhotos recebidos no escritório')
  })

  it('limpa o motivo quando o diálogo é reaberto do zero', async () => {
    await renderDialog({
      isOpen: true,
      isSubmitting: false,
      onClose: () => {},
      onSubmit: () => {},
      openDocumentCount: 1,
    })
    await typeReason('Canhotos recebidos no escritório')

    await rerenderDialog({
      isOpen: false,
      isSubmitting: false,
      onClose: () => {},
      onSubmit: () => {},
      openDocumentCount: 1,
    })
    await rerenderDialog({
      isOpen: true,
      isSubmitting: false,
      onClose: () => {},
      onSubmit: () => {},
      openDocumentCount: 1,
    })

    expect(reasonInput().value).toBe('')
  })

  it('o botão de fechar chama onClose sem enviar nada', async () => {
    let closed = false
    const submitted: (null | string)[] = []
    await renderDialog({
      isOpen: true,
      isSubmitting: false,
      onClose: () => {
        closed = true
      },
      onSubmit: (reason) => submitted.push(reason),
      openDocumentCount: 0,
    })

    const closeButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.getAttribute('aria-label')?.includes('Fechar'),
    )
    if (closeButton === undefined) throw new Error('CLOSE_BUTTON_NOT_FOUND')

    await act(async () => {
      closeButton.click()
      await Promise.resolve()
    })

    expect(closed).toBe(true)
    expect(submitted).toEqual([])
  })
})
