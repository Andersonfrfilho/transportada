/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.2: o controlador dos rascunhos. A leitura só existe com a recomendação aberta; aceitar uma proposta do
 * roteirizador muda o que está "em viagem viva", então os rascunhos são relidos no servidor — nunca remendados na
 * tela. A escolha de roteiro mora na URL e só vale se o roteiro existe na prévia.
 */
import { act } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { useCargoPreviewTripDrafts } from '@/modules/cargo-receiving/hooks/useCargoPreviewTripDrafts.hook'

import { PREVIEW_ID } from '../fixtures/cargoPreview.fixture'
import { installCargoPreviewDouble } from './cargoPreviewHarness.helper'
import { installCargoReceivingDouble, resetLocation } from './cargoReceivingHarness.helper'
import { renderHook, settle, waitFor } from './renderHook.helper'

/** Um gesto do operador: o estado muda dentro de `act`, e a renderização assenta antes da asserção. */
async function run(gesture: () => void): Promise<void> {
  await act(async () => {
    gesture()
    await Promise.resolve()
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
})

async function mountController(search = '') {
  resetLocation(`/recebimento/previas/${PREVIEW_ID}${search}`)
  installCargoReceivingDouble()
  const double = installCargoPreviewDouble()
  const hook = await renderHook(() => useCargoPreviewTripDrafts({ previewId: PREVIEW_ID }))
  return { double, hook }
}

describe('o controlador dos rascunhos de viagem (spec 237 T5.2)', () => {
  test('fechada, não lê nada; aberta, lê uma vez', async () => {
    const { double, hook } = await mountController()
    await settle()
    expect(double.calls.getTripDrafts).toEqual([])
    expect(hook.result().isOpen).toBe(false)

    await run(() => hook.result().open())
    await waitFor(() => expect(hook.result().drafts).toBeDefined())

    expect(double.calls.getTripDrafts).toEqual([PREVIEW_ID])
    hook.unmount()
  })

  test('aceitar uma proposta relê os rascunhos no servidor', async () => {
    const { double, hook } = await mountController('?recommend=1')
    await waitFor(() => expect(hook.result().drafts).toBeDefined())
    expect(double.calls.getTripDrafts).toHaveLength(1)

    await run(() => hook.result().handleAccepted())
    await waitFor(() => expect(double.calls.getTripDrafts).toHaveLength(2))

    hook.unmount()
  })

  test('o roteiro escolhido que não existe na prévia não vira escopo', async () => {
    const { hook } = await mountController('?recommend=1&draftRoute=FR.FANTASMA')
    await waitFor(() => expect(hook.result().drafts).toBeDefined())

    expect(hook.result().scope?.routeName).toBeUndefined()
    expect(hook.result().scope?.documentIds).toHaveLength(4)
    hook.unmount()
  })

  test('escolher o mesmo roteiro de novo desfaz a escolha', async () => {
    const { hook } = await mountController('?recommend=1')
    await waitFor(() => expect(hook.result().drafts).toBeDefined())

    await run(() => hook.result().toggleRoute('FR.R.PRE'))
    expect(hook.result().selectedRouteName).toBe('FR.R.PRE')
    expect(new URLSearchParams(window.location.search).get('draftRoute')).toBe('FR.R.PRE')

    await run(() => hook.result().toggleRoute('FR.R.PRE'))
    expect(hook.result().selectedRouteName).toBeUndefined()
    expect(new URLSearchParams(window.location.search).has('draftRoute')).toBe(false)
    hook.unmount()
  })
})
