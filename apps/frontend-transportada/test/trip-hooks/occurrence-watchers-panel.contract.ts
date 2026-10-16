/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267 (T4.1/T4.2): o painel dos responsáveis **montado de verdade** — o DOM renderizado, na empresa e na contratante.
 * O cliente HTTP é dublado em `occurrenceWatchersHarness.helper`.
 */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceWatchersPanel } from '@/modules/occurrence-conversation/components/OccurrenceWatchersPanel.component'

import {
  ANA,
  BRUNO_CANDIDATE,
  installOccurrenceWatchersDouble,
  watcherFakes,
} from './occurrenceWatchersHarness.helper'
import { renderWithQueryClient, settle, waitFor, type RenderedComponent } from './renderHook.helper'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000267c01'

let rendered: RenderedComponent | undefined

async function mountPanel(
  props: Parameters<typeof OccurrenceWatchersPanel>[0] = {
    canManage: true,
    scope: { kind: 'company' },
  },
): Promise<void> {
  rendered = await renderWithQueryClient(createElement(OccurrenceWatchersPanel, props))
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

function buttonByText(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${label}`)
  return found
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
  await settle()
}

beforeEach(() => {
  installOccurrenceWatchersDouble()
  document.body.innerHTML = ''
})

afterEach(async () => {
  rendered?.unmount()
  rendered = undefined
  await settle()
})

describe('o painel dos responsáveis na empresa (spec 267 RF1)', () => {
  it('lista cada responsável com o e-mail mascarado e o interruptor Ativo marcado', async () => {
    watcherFakes.lists.company = { effectiveSource: null, watchers: [ANA] }
    await mountPanel()

    await waitFor(() => expect(text()).toContain('Ana'))
    expect(text()).toContain('a***@e***.example')
    const active = document.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(active?.checked).toBe(true)
    expect(watcherFakes.calls).toContain('list:company')
  })

  it('desativar manda o PATCH com o estado novo; o inelegível continua listado com o selo', async () => {
    watcherFakes.lists.company = {
      effectiveSource: null,
      watchers: [ANA, { ...ANA, eligible: false, name: 'Carla', userId: 'user-carla' }],
    }
    await mountPanel()
    await waitFor(() => expect(text()).toContain('Carla'))
    expect(text()).toContain('não elegível')

    const [first] = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    await click(first as HTMLInputElement)

    expect(watcherFakes.calls).toContain('status:company:user-ana:inactive')
  })

  it('remover pede confirmação na página e só então apaga; cancelar não apaga', async () => {
    watcherFakes.lists.company = { effectiveSource: null, watchers: [ANA] }
    await mountPanel()
    await waitFor(() => expect(text()).toContain('Ana'))

    await click(buttonByText('Remover'))
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(watcherFakes.calls.some((call) => call.startsWith('remove:'))).toBe(false)
    await click(buttonByText('Cancelar'))
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    expect(watcherFakes.calls.some((call) => call.startsWith('remove:'))).toBe(false)

    await click(buttonByText('Remover'))
    const dialog = document.querySelector('[role="alertdialog"]') as HTMLElement
    const confirm = [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Remover',
    ) as HTMLElement
    await click(confirm)
    expect(watcherFakes.calls).toContain('remove:company:user-ana')
  })

  it('o erro da API aparece com a mensagem do código', async () => {
    watcherFakes.lists.company = { effectiveSource: null, watchers: [ANA] }
    await mountPanel()
    await waitFor(() => expect(text()).toContain('Ana'))
    watcherFakes.failWith = 'OCCURRENCE_WATCHER_NOT_ELIGIBLE'
    const [first] = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')

    await click(first as HTMLInputElement)

    expect(document.querySelector('[role="alert"]')?.textContent ?? '').toContain(
      'Este usuário não pode ser responsável',
    )
  })

  it('sem settings.manage nada é pedido à API', async () => {
    await mountPanel({ canManage: false, scope: { kind: 'company' } })

    expect(watcherFakes.calls).toEqual([])
  })
})

describe('o painel dos responsáveis na contratante (spec 267 RF2)', () => {
  it('diz que a lista da empresa vale quando não há ativo próprio', async () => {
    await mountPanel({
      canManage: true,
      scope: { contractorId: CONTRACTOR_ID, kind: 'contractor' },
    })

    await waitFor(() => expect(text()).toContain('Nenhum ativo — vale a lista da empresa.'))
    expect(watcherFakes.calls).toContain(`list:contractor:${CONTRACTOR_ID}`)
  })

  it('com ativo próprio diz que a lista da contratante substitui a da empresa', async () => {
    watcherFakes.lists[`contractor:${CONTRACTOR_ID}`] = {
      effectiveSource: 'contractor',
      watchers: [ANA],
    }
    await mountPanel({
      canManage: true,
      scope: { contractorId: CONTRACTOR_ID, kind: 'contractor' },
    })

    await waitFor(() => expect(text()).toContain('substitui a da empresa'))
    expect(text()).toContain('Ana')
  })

  it('só inativos: continua dizendo que vale a da empresa, e a linha segue listada', async () => {
    watcherFakes.lists[`contractor:${CONTRACTOR_ID}`] = {
      effectiveSource: 'company',
      watchers: [{ ...ANA, status: 'inactive' }],
    }
    await mountPanel({
      canManage: true,
      scope: { contractorId: CONTRACTOR_ID, kind: 'contractor' },
    })

    await waitFor(() => expect(text()).toContain('Ana'))
    expect(text()).toContain('Nenhum ativo — vale a lista da empresa.')
  })

  it('adiciona a partir dos candidatos: o POST leva o usuário escolhido, no escopo da contratante', async () => {
    watcherFakes.candidates = [BRUNO_CANDIDATE]
    await mountPanel({
      canManage: true,
      scope: { contractorId: CONTRACTOR_ID, kind: 'contractor' },
    })
    await waitFor(() => expect(watcherFakes.calls).toContain('candidates'))

    await click(document.querySelector('button[aria-label="Adicionar responsável"]') as HTMLElement)
    const option = [...document.querySelectorAll('[role="option"]')].find((node) =>
      node.textContent?.includes('Bruno'),
    ) as HTMLElement
    await click(option)
    await click(buttonByText('Adicionar'))

    expect(watcherFakes.calls).toContain(`add:contractor:${CONTRACTOR_ID}:user-bruno`)
  })
})
