/* Copyright (c) 2026 Ada Technology. MIT License. */
import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { KeyReaderField, type KeyReaderFieldHandle } from '../../src/components/ui/key-reader-field'

const KEY_ONE = '35080599999090910270550010000000015180051273'

/** Módulo 11 escrito de forma independente do código, só para fabricar chaves válidas. */
function withCheckDigit(base43: string): string {
  const sum = [...base43]
    .reverse()
    .reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * ((index % 8) + 2), 0)
  const remainder = sum % 11
  return `${base43}${remainder < 2 ? 0 : 11 - remainder}`
}

const KEY_TWO = withCheckDigit('3526071200123456000155001000000001100000000')
const LABELS = { field: 'Leitor', idle: 'Clique aqui para voltar a ler', ready: 'Leitor pronto' }

let root: Root
let container: HTMLDivElement
let reads: string[]
let unreadable: number
const handle = createRef<KeyReaderFieldHandle>()

/** O contêiner nasce aqui, não num `beforeEach`: outras suítes do mesmo processo limpam o `body`. */
function mount(): HTMLInputElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root.render(
      createElement(KeyReaderField, {
        labels: LABELS,
        onRead: (key: string) => reads.push(key),
        onUnreadable: () => {
          unreadable += 1
        },
        ref: handle,
      }),
    )
  })
  return container.querySelector('input') as HTMLInputElement
}

function press(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

function scan(input: HTMLInputElement, text: string, closingKey: string): KeyboardEvent {
  input.value = text
  return press(input, closingKey)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('handheld key reader field', () => {
  beforeEach(() => {
    reads = []
    unreadable = 0
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('abre focado e mostra o selo de pronto', () => {
    const input = mount()

    expect(document.activeElement).toBe(input)
    expect(container.textContent).toContain(LABELS.ready)
  })

  it('Enter fecha a leitura e limpa o campo na hora', () => {
    const input = mount()
    scan(input, `https://x?p=${KEY_ONE}|2`, 'Enter')

    expect(reads).toEqual([KEY_ONE])
    expect(input.value).toBe('')
  })

  it('Tab fecha a leitura sem deixar o foco sair', () => {
    const input = mount()
    const event = scan(input, KEY_ONE, 'Tab')

    expect(event.defaultPrevented).toBe(true)
    expect(reads).toEqual([KEY_ONE])
    expect(document.activeElement).toBe(input)
  })

  it('Tab com o campo vazio segue a navegação por teclado', () => {
    const input = mount()

    expect(press(input, 'Tab').defaultPrevented).toBe(false)
  })

  it('duas leituras com menos de 100 ms entre elas chegam as duas', () => {
    const input = mount()
    scan(input, KEY_ONE, 'Enter')
    scan(input, KEY_TWO, 'Tab')
    scan(input, `x${KEY_ONE}`, 'Enter')

    expect(reads).toEqual([KEY_ONE, KEY_TWO, KEY_ONE])
  })

  it('leitura sem chave é ignorada em silêncio e avisada só ao chamador opcional', () => {
    const input = mount()
    scan(input, '7891000100103', 'Enter')

    expect(reads).toEqual([])
    expect(unreadable).toBe(1)
    expect(input.value).toBe('')
  })

  it('perder o foco troca o selo por um botão que o devolve', () => {
    const input = mount()
    act(() => input.blur())
    const button = container.querySelector('button') as HTMLButtonElement

    expect(button.textContent).toBe(LABELS.idle)
    act(() => button.click())
    expect(document.activeElement).toBe(input)
    expect(container.textContent).toContain(LABELS.ready)
  })

  it('a ref expõe focus() para quem fecha um fluxo', () => {
    const input = mount()
    act(() => input.blur())
    act(() => handle.current?.focus())

    expect(document.activeElement).toBe(input)
  })

  it('rajada rápida fora de qualquer campo é desviada para o leitor', () => {
    const input = mount()
    act(() => input.blur())
    const burst = KEY_ONE.slice(0, 10)
    for (const key of burst) press(document.body, key)

    expect(document.activeElement).toBe(input)
    expect(input.value.startsWith(burst.slice(0, 8))).toBe(true)
  })

  it('digitação lenta fora de campo não é desviada', async () => {
    const input = mount()
    act(() => input.blur())
    for (const key of '12345678') {
      press(document.body, key)
      await sleep(40)
    }

    expect(document.activeElement).not.toBe(input)
    expect(input.value).toBe('')
  })

  it('rajada dentro de outro campo fica nele', () => {
    const input = mount()
    const other = document.createElement('input')
    document.body.append(other)
    act(() => other.focus())
    for (const key of KEY_ONE.slice(0, 12)) press(other, key)

    expect(document.activeElement).toBe(other)
    expect(input.value).toBe('')
  })

  it('o foco volta ao leitor quando um diálogo fecha', async () => {
    const input = mount()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    const field = document.createElement('input')
    dialog.append(field)
    document.body.append(dialog)
    act(() => field.focus())
    expect(document.activeElement).toBe(field)

    act(() => dialog.remove())
    await act(async () => {
      await sleep(5)
    })

    expect(document.activeElement).toBe(input)
  })

  it('há texto de selo em pt-BR e en no namespace compartilhado', async () => {
    const ptBr = (await import('../../src/modules/shared/locales/keyReader.locale.json')).default
    const en = (await import('../../src/modules/shared/locales/keyReader.en.locale.json')).default

    expect(Object.keys(ptBr).sort()).toEqual(Object.keys(en).sort())
  })
})
