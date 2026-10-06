/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (terceira revisão M-3): o invólucro do `Tooltip` só ganha a classe que estica o filho
 * quando o uso pede `fill`. O contrato de texto do CSS não prende o `className` do componente:
 * trocá-lo por `triggerFill` fixo devolveria ao pino de posição da viagem a largura de 344px.
 */
import { createElement } from 'react'
import { describe, expect, mock, test } from 'bun:test'

import { renderWithQueryClient } from './renderHook.helper'

/** O bun não gera nomes de classe para CSS module: com o espelho de identidade o `className` aparece. */
await mock.module('@/components/ui/tooltip.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}))

async function readWrapperClassName(fill: boolean): Promise<string> {
  const { Tooltip } = await import('@/components/ui/tooltip')
  const rendered = await renderWithQueryClient(
    createElement(Tooltip, {
      children: createElement('button', { type: 'button' }, 'Gatilho'),
      fill,
      label: 'Dica de teste',
    }),
  )
  try {
    const wrapper = document.querySelector('button')?.parentElement
    if (wrapper === null || wrapper === undefined) throw new Error('TOOLTIP_WRAPPER_NOT_FOUND')
    return wrapper.className
  } finally {
    rendered.unmount()
  }
}

describe('Tooltip: a classe do invólucro segue o modificador fill', () => {
  test('sem fill o invólucro encolhe ao conteúdo; com fill ele estica o filho', async () => {
    const plain = await readWrapperClassName(false)
    const filled = await readWrapperClassName(true)

    expect(plain).toContain('trigger')
    expect(plain).not.toContain('triggerFill')
    expect(filled).toContain('triggerFill')
  })
})
