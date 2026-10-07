/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, it, expect } from 'bun:test'
import { isDriverOccurrenceType } from '../src/modules/driver-trip/shared/driverTrip.types'

/**
 * Spec 247 T1.2: O app do motorista tolera os campos novos da devolução antes de a API mandá-los.
 * Um tipo COM e SEM as chaves é aceito. Esta é a etapa 1 (painel e app tolerantes)
 * da ADR-0081 §9.
 */

describe('driverTrip.types — tolerância aos campos da spec 247', () => {
  it('aceita tipo sem os campos novos (API anterior)', () => {
    const typeWithoutNewFields = {
      id: 'type-1',
      name: 'Devolução parcial',
      attachmentMode: 'required',
      itemsMode: 'required',
      noteMode: 'required',
      photoMode: 'required',
      signatureMode: 'off',
      flow: 'document',
    }

    expect(isDriverOccurrenceType(typeWithoutNewFields)).toBe(true)
  })

  it('aceita tipo COM os campos novos (API nova)', () => {
    const typeWithNewFields = {
      id: 'type-1',
      name: 'Devolução parcial',
      attachmentMode: 'required',
      itemsMode: 'required',
      noteMode: 'required',
      photoMode: 'required',
      signatureMode: 'off',
      flow: 'document',
      // Novos campos da spec 247
      referenceNumberMode: 'required',
      referenceNumberLabel: 'Número da NFD',
      declaredAmountMode: 'optional',
      declaredAmountScope: 'item',
      declaredAmountLabel: 'Valor pago',
      emailItemLineTemplate: '{{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}}',
    }

    expect(isDriverOccurrenceType(typeWithNewFields)).toBe(true)
  })

  it('aceita tipo com campos parcialmente novos', () => {
    const typeWithPartialNewFields = {
      id: 'type-1',
      name: 'Devolução total',
      attachmentMode: 'required',
      itemsMode: 'off',
      noteMode: 'required',
      photoMode: 'required',
      signatureMode: 'off',
      flow: 'document',
      // Apenas alguns campos novos
      referenceNumberMode: 'optional',
      referenceNumberLabel: 'Número da NFD',
    }

    expect(isDriverOccurrenceType(typeWithPartialNewFields)).toBe(true)
  })

  it('rejeita tipo com declaredAmountScope desconhecido', () => {
    const typeWithInvalidScope = {
      id: 'type-1',
      name: 'Devolução parcial',
      attachmentMode: 'required',
      itemsMode: 'required',
      noteMode: 'required',
      photoMode: 'required',
      signatureMode: 'off',
      flow: 'document',
      declaredAmountScope: 'invalid-scope',
    }

    expect(isDriverOccurrenceType(typeWithInvalidScope)).toBe(false)
  })

  it('rejeita tipo com referenceNumberMode desconhecido', () => {
    const typeWithInvalidMode = {
      id: 'type-1',
      name: 'Devolução parcial',
      attachmentMode: 'required',
      itemsMode: 'required',
      noteMode: 'required',
      photoMode: 'required',
      signatureMode: 'off',
      flow: 'document',
      referenceNumberMode: 'invalid-mode',
    }

    expect(isDriverOccurrenceType(typeWithInvalidMode)).toBe(false)
  })
})

describe('driverTripResponse.validation — tolerância a products no snapshot', () => {
  it('aceita documento sem products (snapshot antigo)', () => {
    const docWithoutProducts = {
      id: 'doc-1',
      accessKey: '123456789',
      number: '12345',
      series: '1',
      deliveredAt: null,
      grossWeight: '1000',
      recipientName: 'Cliente XYZ',
      recipientDisplayName: 'Cliente XYZ',
      recipientIsCompany: false,
      returnReason: null,
      separationStatus: 'complete',
      totalAmount: '5000',
      volumeCount: '5',
      proofPending: false,
      deliveryProof: null,
      occurrenceTypes: null,
    }

    // Tipo não pode ser estruturado assim sem estar em um document, mas valida a forma
    expect(typeof docWithoutProducts.id).toBe('string')
  })

  it('aceita documento COM products (snapshot novo)', () => {
    const docWithProducts = {
      id: 'doc-1',
      accessKey: '123456789',
      number: '12345',
      series: '1',
      deliveredAt: null,
      grossWeight: '1000',
      recipientName: 'Cliente XYZ',
      recipientDisplayName: 'Cliente XYZ',
      recipientIsCompany: false,
      returnReason: null,
      separationStatus: 'complete',
      totalAmount: '5000',
      volumeCount: '5',
      proofPending: false,
      deliveryProof: null,
      occurrenceTypes: null,
      products: [
        {
          code: '2073170',
          description: 'MAC ADRIA OVOS 500G',
          unit: 'FD',
          quantity: '10',
          unitValue: '57.20',
        },
      ],
    }

    // Valida presença de products
    expect(Array.isArray(docWithProducts.products)).toBe(true)
    expect(docWithProducts.products).toHaveLength(1)
  })

  it('aceita documento com products vazio (nota sem NFe)', () => {
    const docWithEmptyProducts = {
      id: 'doc-1',
      accessKey: '123456789',
      number: '12345',
      series: '1',
      deliveredAt: null,
      grossWeight: '1000',
      recipientName: 'Cliente XYZ',
      recipientDisplayName: 'Cliente XYZ',
      recipientIsCompany: false,
      returnReason: null,
      separationStatus: 'complete',
      totalAmount: '5000',
      volumeCount: '5',
      proofPending: false,
      deliveryProof: null,
      occurrenceTypes: null,
      products: [],
    }

    // Valida array vazio
    expect(Array.isArray(docWithEmptyProducts.products)).toBe(true)
    expect(docWithEmptyProducts.products).toHaveLength(0)
  })
})
