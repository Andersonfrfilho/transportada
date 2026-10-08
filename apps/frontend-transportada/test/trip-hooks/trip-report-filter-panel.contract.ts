/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import { TripReportFilterPanel } from '@/modules/trip/components/TripReportFilterPanel.component'
import {
  useTripReportFilters,
  type TripReportFiltersController,
} from '@/modules/trip/hooks/useTripReportFilters.hook'
import { i18n } from '@/modules/shared/i18n/i18n.service'

import { typeQuantity } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const tNfe = i18n.getFixedT('pt-BR', 'nfeWorkspace')
const tTrip = i18n.getFixedT('pt-BR', 'trip')

function labelled(label: string): Element | null {
  return document.querySelector(`[aria-label="${label}"]`)
}

describe('trip report filter panel built on the shared nfe panel', () => {
  test('shows the shared simple controls plus the trip section, never the unlinked-only checkbox', async () => {
    const captured: { current?: TripReportFiltersController } = {}
    function Host(): ReturnType<typeof createElement> {
      const filters = useTripReportFilters({ fetchFacets: () => Promise.reject(new Error('off')) })
      captured.current = filters
      return createElement(TripReportFilterPanel, { contractors: [], filters })
    }
    const rendered = await renderWithQueryClient(createElement(Host))

    const sharedLabels = [
      tNfe('documents.fields.cteIssued'),
      tNfe('documents.numberFrom'),
      tNfe('documents.numberTo'),
      tNfe('documents.fields.issuedAt'),
      tNfe('documents.fields.totalAmount'),
      tNfe('documents.fields.emitterName'),
      tNfe('documents.fields.emitterTaxId'),
      tNfe('documents.fields.emitterAddress'),
      tNfe('documents.fields.emitterCity'),
      tNfe('documents.fields.emitterState'),
      tNfe('documents.fields.recipientName'),
      tNfe('documents.fields.recipientAddress'),
      tNfe('documents.fields.recipientCity'),
      tNfe('documents.fields.recipientState'),
      tNfe('documents.fields.status'),
    ]
    for (const label of sharedLabels) expect(labelled(label) !== null).toBe(true)

    const tripLabels = [
      tTrip('filters.report.search'),
      tTrip('filters.report.contractor'),
      tTrip('filters.report.documentStatus'),
    ]
    for (const label of tripLabels) expect(labelled(label) !== null).toBe(true)

    expect(document.body.textContent?.includes(tNfe('filters.unlinkedOnly'))).toBe(false)
    expect(document.body.textContent?.includes(tTrip('filters.report.hint'))).toBe(true)

    await typeQuantity(tNfe('documents.numberFrom'), '15')
    await typeQuantity(tTrip('filters.report.search'), '123')
    expect(captured.current?.state.numberFrom).toBe('15')
    expect(captured.current?.state.search).toBe('123')
    expect(captured.current?.activeCount).toBe(2)
    rendered.unmount()
  })
})
