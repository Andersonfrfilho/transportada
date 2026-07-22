/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { FREIGHT_DOCUMENT, FREIGHT_RULE_CREATE, loadFutureModule } from './freight.fixture'

describe('freight presentation boundary contract', () => {
  test('keeps rule form and simulation form boundaries strict without tenant selectors or fiscal payload fields', async () => {
    const { createFreightDrafts } = await loadFutureModule<FreightDraftModule>(
      '../../src/modules/freight/shared/freightDraft.service',
    )
    const drafts = createFreightDrafts()

    expect(drafts.createRuleDraft()).toEqual(FREIGHT_RULE_CREATE)
    expect(
      drafts.createSimulationDraft({
        documentId: FREIGHT_DOCUMENT.id,
      }),
    ).toEqual({
      documentId: FREIGHT_DOCUMENT.id,
    })

    expect(() =>
      drafts.createSimulationDraft({
        companyId: 'forbidden-company',
        documentId: FREIGHT_DOCUMENT.id,
      }),
    ).toThrow('FREIGHT_INVALID_SIMULATION_DRAFT')
    expect(() =>
      drafts.createRuleDraft({
        percentage: '0.035000',
        xml: '<nfeProc />',
      }),
    ).toThrow('FREIGHT_INVALID_RULE_DRAFT')
  })
})

type FreightDraftModule = {
  readonly createFreightDrafts: () => {
    readonly createRuleDraft: (input?: Record<string, unknown>) => typeof FREIGHT_RULE_CREATE
    readonly createSimulationDraft: (input: Record<string, unknown>) => {
      readonly documentId: string
    }
  }
}
