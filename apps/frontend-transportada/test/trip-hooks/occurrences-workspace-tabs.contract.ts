/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão do painel M8): a aba Tipos só existe para quem pode gerir as configurações, e a aba
 * ativa vive na URL — recarregar mantém a aba. Comportamento no DOM, com e sem permissão.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { TripOccurrencesTabs } from '@/modules/trip/components/TripOccurrencesTabs.component'

import { createUnexpectedTripClient } from '../fixtures/tripAssemblyHooks.fixture'
import { click } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { tripHookFakes } from './tripClientMocks.helper'

const mounted: { unmount: () => void }[] = []

function scenario(search: string, body: () => Promise<void>): () => Promise<void> {
  return async () => {
    tripHookFakes.tripClient = {
      ...createUnexpectedTripClient(),
      listOccurrenceAttachmentOverridesBatch: () => Promise.resolve([]),
      listOccurrenceTypes: () => Promise.resolve([]),
    }
    window.history.replaceState(null, '', `/ocorrencias${search}`)
    try {
      await body()
    } finally {
      for (const rendered of mounted.splice(0)) rendered.unmount()
      window.history.replaceState(null, '', '/')
    }
  }
}

async function mount(canManageSettings: boolean): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(TripOccurrencesTabs, {
        canManageSettings,
        feedPanel: createElement('p', null, 'conteúdo do feed'),
      }),
    ),
  )
}

function tabLabels(): readonly string[] {
  return [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim() ?? '')
}

describe('abas de Ocorrências (revisão do painel M8)', () => {
  test(
    'sem permissão a aba Tipos não existe, nem pela URL',
    scenario('?tab=types', async () => {
      await mount(false)
      expect(tabLabels()).toEqual(['Feed'])
      expect(document.body.textContent?.includes('conteúdo do feed')).toBe(true)
    }),
  )

  test(
    'com permissão as duas abas aparecem, a URL abre a aba pedida e a troca grava a URL',
    scenario('?tab=types', async () => {
      await mount(true)
      expect(tabLabels()).toEqual(['Feed', 'Tipos'])
      await waitFor(() => expect(document.body.textContent?.includes('Novo tipo')).toBe(true))
      expect(document.body.textContent?.includes('conteúdo do feed')).toBe(false)

      const feedTab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')][0]
      if (feedTab === undefined) throw new Error('TAB_NOT_FOUND')
      await click(feedTab)
      expect(window.location.search).toBe('')
      expect(document.body.textContent?.includes('conteúdo do feed')).toBe(true)

      const typesTab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')][1]
      if (typesTab === undefined) throw new Error('TAB_NOT_FOUND')
      await act(async () => {
        typesTab.click()
        await Promise.resolve()
      })
      expect(window.location.search).toBe('?tab=types')
    }),
  )
})
