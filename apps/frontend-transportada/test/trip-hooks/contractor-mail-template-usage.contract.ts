/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T4.2 (RF7): o 409 de arquivar um modelo `occurrence` em uso mostra os tipos e as exceções por
 * contratante que ainda o escolhem. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { ContractorMailTemplateUsageList } from '@/modules/delivery-clients/components/ContractorMailTemplateUsageList.component'

import { renderWithQueryClient } from './renderHook.helper'

async function mount(usage: {
  contractorExceptions: readonly string[]
  occurrenceTypes: readonly string[]
}): Promise<() => void> {
  const rendered = await renderWithQueryClient(
    createElement(ContractorMailTemplateUsageList, { usage }),
  )
  return rendered.unmount
}

describe('a lista de uso do modelo (spec 269 RF7)', () => {
  test('mostra os tipos e as exceções por contratante, cada um com seu nome', async () => {
    const unmount = await mount({
      contractorExceptions: ['Recusa total / Distribuidora Aurora'],
      occurrenceTypes: ['Devolução parcial', 'Recusa total'],
    })
    const text = document.body.textContent ?? ''

    expect(text).toContain('Tipos de ocorrência que o usam:')
    expect(text).toContain('Devolução parcial')
    expect(text).toContain('Recusa total / Distribuidora Aurora')
    expect([...document.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'Devolução parcial',
      'Recusa total',
      'Recusa total / Distribuidora Aurora',
    ])
    unmount()
  })

  test('sem tipo nem exceção não desenha nada', async () => {
    const unmount = await mount({ contractorExceptions: [], occurrenceTypes: [] })

    expect(document.body.textContent).toBe('')
    unmount()
  })
})
