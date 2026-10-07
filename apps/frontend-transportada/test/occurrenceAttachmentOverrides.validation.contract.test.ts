/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, it, expect } from 'bun:test'
import { readOccurrenceAttachmentOverrides } from '../src/modules/trip/shared/occurrenceAttachmentOverrides.validation'

/**
 * Spec 247 T1.1 (exceções): As exceções toleram os dois modos novos antes de a API mandá-los.
 * Uma exceção COM e SEM as chaves é aceita. Exceção = override por contratante ou destinatário.
 */

describe('occurrenceAttachmentOverrides.validation — tolerância aos dois modos da spec 247', () => {
  it('aceita exceção sem os modos novos (API anterior)', () => {
    const overridesWithoutNewModes = {
      contractorOverrides: [
        {
          attachmentMode: 'required',
          contractorId: 'contractor-1',
          noteMode: 'required',
          signatureMode: 'off',
          itemsMode: 'optional',
        },
      ],
      recipientOverrides: [
        {
          attachmentMode: 'required',
          taxId: 'cnpj-1',
          noteMode: 'required',
          signatureMode: 'off',
          itemsMode: 'optional',
        },
      ],
    }

    const result = readOccurrenceAttachmentOverrides(overridesWithoutNewModes)
    expect(result).toBeDefined()
    expect(result?.contractorOverrides).toHaveLength(1)
  })

  it('aceita exceção COM os modos novos (API nova)', () => {
    const overridesWithNewModes = {
      contractorOverrides: [
        {
          attachmentMode: 'required',
          contractorId: 'contractor-1',
          noteMode: 'required',
          signatureMode: 'off',
          itemsMode: 'optional',
          // Novos campos da spec 247
          referenceNumberMode: 'required',
          declaredAmountMode: 'optional',
        },
      ],
      recipientOverrides: [
        {
          attachmentMode: 'required',
          taxId: 'cnpj-1',
          noteMode: 'required',
          signatureMode: 'off',
          itemsMode: 'optional',
          // Novos campos da spec 247
          referenceNumberMode: 'optional',
          declaredAmountMode: 'required',
        },
      ],
    }

    const result = readOccurrenceAttachmentOverrides(overridesWithNewModes)
    expect(result).toBeDefined()
    expect(result?.contractorOverrides).toHaveLength(1)
    expect(result?.recipientOverrides).toHaveLength(1)
  })

  it('aceita exceção com nulo nos modos novos (herda do tipo)', () => {
    const overridesWithNullModes = {
      contractorOverrides: [
        {
          attachmentMode: 'required',
          contractorId: 'contractor-1',
          noteMode: 'required',
          signatureMode: 'off',
          itemsMode: 'optional',
          // Nulo = herda do tipo
          referenceNumberMode: null,
          declaredAmountMode: null,
        },
      ],
      recipientOverrides: [],
    }

    const result = readOccurrenceAttachmentOverrides(overridesWithNullModes)
    expect(result).toBeDefined()
    expect(result?.contractorOverrides).toHaveLength(1)
  })

  it('rejeita exceção com modo desconhecido nos campos novos', () => {
    const overridesWithInvalidMode = {
      contractorOverrides: [
        {
          attachmentMode: 'required',
          contractorId: 'contractor-1',
          noteMode: 'required',
          signatureMode: 'off',
          itemsMode: 'optional',
          referenceNumberMode: 'invalid-mode',
        },
      ],
      recipientOverrides: [],
    }

    const result = readOccurrenceAttachmentOverrides(overridesWithInvalidMode)
    expect(result).toBeUndefined()
  })
})
