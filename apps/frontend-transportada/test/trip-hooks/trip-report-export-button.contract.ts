/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { act, createElement } from 'react'

import '@/modules/shared/i18n/i18n.service'
import { TripReportExportButton } from '@/modules/trip/components/TripReportExportButton.component'

import type { TripReportPage } from '@/modules/trip/shared/tripReport.types'

import { renderWithQueryClient, waitFor } from './renderHook.helper'

function findButton(): HTMLButtonElement {
  const button = document.body.querySelector<HTMLButtonElement>('button[aria-label]')
  if (button === null) throw new Error('BUTTON_NOT_RENDERED')
  return button
}

describe('TripReportExportButton', () => {
  test('rótulo acessível, ícone e habilitado quando parado', async () => {
    const view = await renderWithQueryClient(
      createElement(TripReportExportButton, { scope: { selectedTripIds: ['trip-1'] } }),
    )
    const button = findButton()
    expect(button.getAttribute('aria-label')).toBe('Exportar relatório')
    expect(button.textContent).toBe('Exportar relatório')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.disabled).toBe(false)
    expect(document.body.querySelector('[role="alert"]')).toBeNull()
    view.unmount()
  })

  test('exportando, o botão desabilita e mostra o progresso', async () => {
    const view = await renderWithQueryClient(
      createElement(TripReportExportButton, {
        fetchPage: () => new Promise<TripReportPage>(() => undefined),
        scope: { filters: {} },
      }),
    )
    await act(async () => {
      findButton().click()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(findButton().disabled).toBe(true)
      expect(findButton().textContent).toContain('Exportando')
    })
    expect(findButton().getAttribute('aria-label')).toBe('Exportar relatório')
    view.unmount()
  })
})
