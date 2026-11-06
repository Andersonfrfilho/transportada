/* Copyright (c) 2026 Ada Technology. MIT License. */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { AccessKeyLookupRow } from '../../src/modules/nfe-access-key-lookup/components/AccessKeyLookupRow.component'
import type { AccessKeyLookupRowState } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'
import ptBr from '../../src/modules/nfe-access-key-lookup/locales/accessKeyLookup.locale.json'
import { KEY_ONE } from './lookup.fixture'

let root: Root | undefined
let container: HTMLElement | undefined

function render(
  state: AccessKeyLookupRowState,
  callbacks: Partial<Parameters<typeof AccessKeyLookupRow>[0]> = {},
): HTMLElement {
  container = document.createElement('ul')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      createElement(AccessKeyLookupRow, {
        onAdd: () => undefined,
        onOpen: () => undefined,
        onRetry: () => undefined,
        onSendXml: () => undefined,
        row: { accessKey: KEY_ONE, lookupId: null, state },
        ...callbacks,
      }),
    )
  })
  return container
}

function buttons(element: HTMLElement): string[] {
  return [...element.querySelectorAll('button')].map((button) => button.textContent ?? '')
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('linha da busca por chave', () => {
  it('mostra número, série e CNPJ do emitente lidos da chave', () => {
    const text = render({ kind: 'checking' }).textContent ?? ''

    expect(text).toContain('NF 1')
    expect(text).toContain('série 1')
    expect(text).toContain('99.999.090/9102-70')
    expect(text).toContain(ptBr.state.checking)
  })

  it('buscando: texto de progresso e nenhum botão', () => {
    const element = render({ kind: 'searching', status: 'querying' })

    expect(element.textContent).toContain('Buscando na SEFAZ…')
    expect(buttons(element)).toEqual([])
  })

  it('na fila: mostra a próxima janela em HH:MM', () => {
    const notBefore = '2026-11-06T18:30:00.000Z'
    const expected = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(notBefore))
    const element = render({ kind: 'waiting', notBefore })

    expect(element.textContent).toContain(`Na fila da SEFAZ — próxima janela ${expected}`)
    expect(buttons(element)).toEqual([])
  })

  it('na fila sem horário não inventa hora', () => {
    expect(render({ kind: 'waiting', notBefore: null }).textContent).toContain(
      ptBr.state.waitingNoTime,
    )
  })

  it('pronta: Acrescentar e Abrir, entregando chave e documento', () => {
    const calls: string[] = []
    const element = render(
      { documentId: 'doc-1', kind: 'ready' },
      {
        onAdd: (key, documentId) => calls.push(`add:${key}:${documentId}`),
        onOpen: (key, documentId) => calls.push(`open:${key}:${documentId}`),
      },
    )
    expect(buttons(element)).toEqual(['Acrescentar', 'Abrir'])

    for (const button of element.querySelectorAll('button')) act(() => button.click())

    expect(calls).toEqual([`add:${KEY_ONE}:doc-1`, `open:${KEY_ONE}:doc-1`])
  })

  it('o pai escolhe os botões: sem callback, o botão não existe', () => {
    const element = render({ documentId: 'doc-1', kind: 'ready' }, { onOpen: undefined as never })

    expect(buttons(element)).toEqual(['Acrescentar'])
  })

  it('recusada por resumo: motivo e Enviar XML', () => {
    const element = render({ kind: 'refused', reason: 'summary_only' })

    expect(element.textContent).toContain('A SEFAZ só liberou o resumo desta nota. Envie o XML.')
    expect(buttons(element)).toEqual(['Enviar XML'])
  })

  it('recusada por não interessada traz a frase combinada', () => {
    expect(render({ kind: 'refused', reason: 'not_interested' }).textContent).toContain(
      'A SEFAZ não libera esta nota para a transportadora (ela não consta na nota). Envie o XML.',
    )
  })

  it('cancelada e denegada não oferecem Enviar XML', () => {
    expect(buttons(render({ kind: 'refused', reason: 'cancelled' }))).toEqual([])
    act(() => root?.unmount())
    container?.remove()
    expect(buttons(render({ kind: 'refused', reason: 'denied' }))).toEqual([])
  })

  it('SEFAZ fora do ar: Enviar XML e Tentar de novo', () => {
    const calls: string[] = []
    const element = render(
      { kind: 'failed', reason: 'sefaz_unavailable' },
      {
        onRetry: (key) => calls.push(`retry:${key}`),
        onSendXml: (key) => calls.push(`xml:${key}`),
      },
    )
    expect(buttons(element)).toEqual(['Enviar XML', 'Tentar de novo'])

    for (const button of element.querySelectorAll('button')) act(() => button.click())

    expect(calls).toEqual([`xml:${KEY_ONE}`, `retry:${KEY_ONE}`])
  })

  it('erro de pedido e busca que passou de 10 min oferecem só Tentar de novo', () => {
    const failed = render({ code: 'RATE_LIMITED', kind: 'error' })
    expect(failed.textContent).toContain(ptBr.error.RATE_LIMITED)
    expect(buttons(failed)).toEqual(['Tentar de novo'])
    act(() => root?.unmount())
    container?.remove()

    const stalled = render({ kind: 'stalled' })
    expect(stalled.textContent).toContain(ptBr.state.stalled)
    expect(buttons(stalled)).toEqual(['Tentar de novo'])
  })

  it('os avisos do pai aparecem na linha', () => {
    const element = render(
      { documentId: 'd', kind: 'ready' },
      { children: createElement('p', { 'data-notice': 'trip' }, 'Já está em outra viagem') },
    )

    expect(element.querySelector('[data-notice="trip"]')).not.toBeNull()
  })
})
