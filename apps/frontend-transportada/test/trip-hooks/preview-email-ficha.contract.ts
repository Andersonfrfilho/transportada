/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (`security.md` §2): a entrada por e-mail é configuração (`settings.manage`, ler e escrever) — a
 * ficha só monta a seção para quem pode geri-la, e quem só lê nem faz a chamada à API.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { ContractorDirectoryPanel } from '@/modules/delivery-clients/components/ContractorDirectoryPanel.component'

import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { previewEmailFakes } from './previewEmailHarness.helper'
import {
  click,
  installContractorDirectoryDouble,
  resetLocation,
  rowNames,
} from './contractorDirectoryHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

async function openFicha(canManage: boolean) {
  resetLocation()
  installContractorDirectoryDouble()
  const reads = { intakes: 0, settings: 0 }
  const original = previewEmailFakes.client
  previewEmailFakes.client = {
    ...original,
    getSettings: (contractorId) => {
      reads.settings += 1
      return original.getSettings(contractorId)
    },
    listIntakes: (contractorId) => {
      reads.intakes += 1
      return original.listIntakes(contractorId)
    },
  }
  const rendered = await renderWithQueryClient(
    createElement(ContractorDirectoryPanel, { canManage }),
  )
  await waitFor(() => expect(rowNames().length).toBeGreaterThan(0))
  await click(
    document.querySelector(
      'button[aria-label="Abrir a ficha de Alfa Indústria Fictícia"]',
    ) as HTMLElement,
  )
  await waitFor(() => expect(document.body.textContent).toContain('Perfil de recebimento'))
  await waitFor(() => expect(document.body.textContent).not.toContain('Carregando o perfil'))
  return { reads, rendered }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('a seção da prévia por e-mail na ficha do contratante (spec 237 T4.6b)', () => {
  test('quem gere as configurações vê a seção, com as duas leituras da API', async () => {
    const restoreLayout = stubVisibleLayout()
    const { reads, rendered } = await openFicha(true)

    await waitFor(() => expect(document.body.textContent).toContain('Prévia por e-mail'))
    await waitFor(() => expect(document.body.textContent).toContain('Recusas recentes'))
    expect(reads.settings).toBe(1)
    expect(reads.intakes).toBe(1)
    rendered.unmount()
    restoreLayout()
  })

  test('quem só lê não vê a seção, e a API da entrada por e-mail nem é chamada', async () => {
    const restoreLayout = stubVisibleLayout()
    const { reads, rendered } = await openFicha(false)

    expect(document.body.textContent).toContain('Perfil de recebimento')
    expect(document.body.textContent?.includes('Prévia por e-mail')).toBe(false)
    expect(reads).toEqual({ intakes: 0, settings: 0 })
    rendered.unmount()
    restoreLayout()
  })
})
