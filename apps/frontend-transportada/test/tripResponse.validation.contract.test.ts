/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, it, expect } from 'bun:test'
import { createTripResponseAdapters } from '../src/modules/trip/shared/tripResponse.validation'

/**
 * Spec 247 T1.1: O painel tolera os campos novos da devolução antes de a API mandá-los.
 * Um tipo COM e SEM as chaves é aceito. Esta é a etapa 1 (painel e app tolerantes)
 * da ADR-0081 §9.
 */

describe('tripResponse.validation — tolerância aos campos da spec 247', () => {
  const adapters = createTripResponseAdapters()

  it('aceita tipo sem os campos novos (API anterior)', () => {
    const typeWithoutNewFields = {
      id: 'type-1',
      name: 'Devolução parcial',
      active: true,
      stage: 'delivery',
      emailBody: 'Corpo do e-mail',
      emailSubject: 'Assunto',
      emailTemplateKey: null,
      notifies: false,
      redeliveryPolicy: 'unset',
      moments: ['document'],
      itemsMode: 'required',
      noteMode: 'required',
      signatureMode: 'off',
      attachmentMode: 'required',
      photoMinimumCount: 1,
      allowsMultipleItems: false,
    }

    // Should not throw
    const result = adapters.occurrenceTypeFromApi(typeWithoutNewFields)
    expect(result).toBeDefined()
  })

  it('aceita tipo COM os campos novos (API nova)', () => {
    const typeWithNewFields = {
      id: 'type-1',
      name: 'Devolução parcial',
      active: true,
      stage: 'delivery',
      emailBody: 'Corpo do e-mail',
      emailSubject: 'Assunto',
      emailTemplateKey: null,
      notifies: false,
      redeliveryPolicy: 'unset',
      moments: ['document'],
      itemsMode: 'required',
      noteMode: 'required',
      signatureMode: 'off',
      attachmentMode: 'required',
      photoMinimumCount: 1,
      allowsMultipleItems: false,
      // Novos campos da spec 247
      referenceNumberMode: 'required',
      referenceNumberLabel: 'Número da NFD',
      declaredAmountMode: 'optional',
      declaredAmountScope: 'item',
      declaredAmountLabel: 'Valor pago',
      emailItemLineTemplate: '{{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}}',
    }

    // Should not throw
    const result = adapters.occurrenceTypeFromApi(typeWithNewFields)
    expect(result).toBeDefined()
  })

  it('aceita tipo com campos parcialmente novos', () => {
    const typeWithPartialNewFields = {
      id: 'type-1',
      name: 'Devolução total',
      active: true,
      stage: 'delivery',
      emailBody: 'Cliente devolveu.',
      emailSubject: 'Devolução total',
      emailTemplateKey: null,
      notifies: false,
      redeliveryPolicy: 'unset',
      moments: ['document'],
      itemsMode: 'off',
      noteMode: 'required',
      signatureMode: 'off',
      attachmentMode: 'required',
      photoMinimumCount: 1,
      allowsMultipleItems: false,
      // Apenas alguns campos novos
      referenceNumberMode: 'optional',
      referenceNumberLabel: 'Número da NFD',
    }

    // Should not throw
    const result = adapters.occurrenceTypeFromApi(typeWithPartialNewFields)
    expect(result).toBeDefined()
  })
})
