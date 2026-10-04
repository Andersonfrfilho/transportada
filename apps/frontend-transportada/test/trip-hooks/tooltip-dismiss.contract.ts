/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (revisão final): o `Tooltip` compartilhado só dispensa a dica ao ativar o gatilho quando
 * o uso pede (`dismissOnActivate`, o caso do `Select` cuja lista nasce sob a dica). Os demais 37 usos
 * — gatilhos só-dica, que o toque abre por foco e clique — mantêm a dica aberta como antes.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import { Tooltip } from '@/components/ui/tooltip'

import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const TIP = 'Dica de teste'

async function mountFocused(dismissOnActivate: boolean): Promise<{
  readonly trigger: HTMLElement
  readonly unmount: () => void
}> {
  const rendered = await renderWithQueryClient(
    createElement(Tooltip, {
      children: createElement('button', { type: 'button' }, 'Gatilho'),
      dismissOnActivate,
      label: TIP,
    }),
  )
  const trigger = document.querySelector<HTMLElement>('button')
  if (trigger === null) throw new Error('TRIGGER_NOT_FOUND')
  await act(async () => {
    trigger.focus()
    await Promise.resolve()
  })
  await waitFor(() => expect(document.body.textContent).toContain(TIP))
  return { trigger, unmount: rendered.unmount }
}

async function pressEnter(trigger: HTMLElement): Promise<void> {
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    await Promise.resolve()
  })
}

describe('Tooltip: dispensar a dica ao ativar o gatilho é opt-in', () => {
  test('o padrão não fecha ao clicar nem ao apertar Enter', async () => {
    const restoreLayout = stubVisibleLayout()
    const { trigger, unmount } = await mountFocused(false)
    try {
      await click(trigger)
      expect(document.body.textContent).toContain(TIP)
      await pressEnter(trigger)
      expect(document.body.textContent).toContain(TIP)
    } finally {
      unmount()
      restoreLayout()
    }
  })

  test('com dismissOnActivate fecha ao clicar', async () => {
    const restoreLayout = stubVisibleLayout()
    const { trigger, unmount } = await mountFocused(true)
    try {
      await click(trigger)
      expect(document.body.textContent).not.toContain(TIP)
    } finally {
      unmount()
      restoreLayout()
    }
  })

  test('com dismissOnActivate fecha ao apertar Enter', async () => {
    const restoreLayout = stubVisibleLayout()
    const { trigger, unmount } = await mountFocused(true)
    try {
      await pressEnter(trigger)
      expect(document.body.textContent).not.toContain(TIP)
    } finally {
      unmount()
      restoreLayout()
    }
  })
})
