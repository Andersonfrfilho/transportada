/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B2: `attachmentMode` de um tipo de ocorrência resolve com as mesmas 4 combinações de
 * presença de RF-D1 (reaproveitando `resolveWithOverrides`, T3 — nenhuma reescrita).
 */
import { describe, expect, it } from 'bun:test'

import {
  resolveOccurrenceAttachmentMode,
  resolveOccurrenceAttachmentModeForRecipient,
} from '../../src/trips/domain/occurrence-attachment-overrides.policy.js'

describe('resolveOccurrenceAttachmentMode (spec 218 RF-B2)', () => {
  it('nenhum override presente: vale o attachmentMode geral do tipo', () => {
    expect(
      resolveOccurrenceAttachmentMode({
        contractorOverride: null,
        general: 'optional',
        recipientOverride: null,
      }),
    ).toBe('optional')
  })

  it('só o override de contratante presente: ele vence o geral', () => {
    expect(
      resolveOccurrenceAttachmentMode({
        contractorOverride: 'required',
        general: 'optional',
        recipientOverride: null,
      }),
    ).toBe('required')
  })

  it('só o override de destinatário presente: ele vence o geral', () => {
    expect(
      resolveOccurrenceAttachmentMode({
        contractorOverride: null,
        general: 'off',
        recipientOverride: 'required',
      }),
    ).toBe('required')
  })

  /** P4 do spec.md: destinatário e contratante colidindo — o destinatário vence. */
  it('os dois presentes: o destinatário vence o contratante', () => {
    expect(
      resolveOccurrenceAttachmentMode({
        contractorOverride: 'off',
        general: 'optional',
        recipientOverride: 'required',
      }),
    ).toBe('required')
  })
})

describe('resolveOccurrenceAttachmentModeForRecipient (spec 218 RF-B2/P3)', () => {
  const lookup = {
    overridesByContractorId: new Map([['contractor-alfa', 'required' as const]]),
    overridesByTaxId: new Map([['12345678000199', 'off' as const]]),
  }

  /** P3 do spec.md: exceção por contratante, sem exceção de destinatário para a mesma nota. */
  it('resolve pelo contratante quando não há exceção do destinatário', () => {
    expect(
      resolveOccurrenceAttachmentModeForRecipient({
        attachmentMode: 'optional',
        contractorId: 'contractor-alfa',
        lookup,
        recipientTaxId: 'sem-excecao',
      }),
    ).toBe('required')
  })

  it('sem contractorId/recipientTaxId (chamador de 1 camada): cai no attachmentMode do tipo', () => {
    expect(
      resolveOccurrenceAttachmentModeForRecipient({
        attachmentMode: 'optional',
        lookup,
      }),
    ).toBe('optional')
  })

  it('destinatário vence contratante quando os dois têm exceção para a mesma nota', () => {
    expect(
      resolveOccurrenceAttachmentModeForRecipient({
        attachmentMode: 'optional',
        contractorId: 'contractor-alfa',
        lookup,
        recipientTaxId: '12345678000199',
      }),
    ).toBe('off')
  })
})
