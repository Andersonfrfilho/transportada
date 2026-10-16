/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T4.3 (RF6, D4): o diálogo "Enviar à contratante" sem modelo efetivo mostra o aviso com o caminho até
 * o editor do tipo, e o envio fica desabilitado. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { ContractorMailMissingTemplateNotice } from '@/modules/occurrence-conversation/components/ContractorMailMissingTemplateNotice.component'
import { WORKSPACE_STORAGE_KEY } from '@/modules/shared/workspaceNavigation.service'

import { click } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

describe('o aviso de tipo sem modelo no diálogo de envio (spec 269 RF6)', () => {
  test('diz que sem modelo o e-mail não sai e leva à aba Tipos de /ocorrencias', async () => {
    const rendered = await renderWithQueryClient(createElement(ContractorMailMissingTemplateNotice))

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Tipo sem modelo de notificação',
    )
    const link = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Abrir tipos de ocorrência',
    )
    await click(link as HTMLElement)

    expect(window.location.pathname + window.location.search).toBe('/ocorrencias?tab=types')
    expect(window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY)).toBe('trip-occurrences')
    rendered.unmount()
  })

  test('o diálogo desabilita o envio com a flag da prévia ou com o 409 da corrida', () => {
    const dialog = readFileSync(
      'src/modules/occurrence-conversation/components/SendToContractorDialog.component.tsx',
      'utf8',
    )

    expect(dialog).toContain('preview?.missingNotificationTemplate === true')
    expect(dialog).toContain("'OCCURRENCE_MAIL_TEMPLATE_MISSING'")
    expect(dialog).toMatch(/disabled=\{isBusy \|\| isTemplateMissing\}\s+type="submit"/u)
  })
})
