/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T4.4 (RF6, D8): o selo "Tipo sem modelo de notificação" no feed (célula e cartão, só o selo) e no
 * detalhe (com o caminho até o editor). Sem a flag, nada aparece. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceMissingTemplateMark } from '@/modules/trip/components/OccurrenceMissingTemplateMark.component'

import { click } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const BADGE = 'Tipo sem modelo de notificação'

describe('o selo de tipo sem modelo (spec 269 RF6)', () => {
  test('o selo do feed diz o aviso e não oferece link (a linha já é um link)', async () => {
    const rendered = await renderWithQueryClient(
      createElement(OccurrenceMissingTemplateMark, { isMissing: true, variant: 'badge' }),
    )

    expect(document.body.textContent).toBe(BADGE)
    expect(document.querySelector('button')).toBeNull()
    rendered.unmount()
  })

  test('o aviso do detalhe leva à aba Tipos de /ocorrencias', async () => {
    const rendered = await renderWithQueryClient(
      createElement(OccurrenceMissingTemplateMark, { isMissing: true, variant: 'notice' }),
    )

    expect(document.body.textContent).toContain(BADGE)
    const link = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Abrir tipos de ocorrência',
    )
    await click(link as HTMLElement)
    expect(window.location.pathname + window.location.search).toBe('/ocorrencias?tab=types')
    rendered.unmount()
  })

  test('sem a flag, ou com ela falsa, nada aparece', async () => {
    for (const isMissing of [false, undefined]) {
      for (const variant of ['badge', 'notice'] as const) {
        const rendered = await renderWithQueryClient(
          createElement(OccurrenceMissingTemplateMark, { isMissing, variant }),
        )
        expect(document.body.textContent).toBe('')
        rendered.unmount()
      }
    }
  })
})
