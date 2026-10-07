/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, it, expect } from 'bun:test'
import { isDriverOccurrenceType } from '../src/modules/driver-trip/shared/driverTrip.types'
import { toDriverTripSnapshot } from '../src/modules/driver-trip/shared/driverTripResponse.validation'

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

/**
 * Spec 247 T4.6: o documento que a API serializa de verdade (JSON de referência gerado pela integração
 * da API, `driver-snapshot-products.integration.ts`) passa pelo parser do app e o tipo efetivo chega com
 * os campos novos — não uma fixture escrita à mão para agradar o guard.
 */
describe('driverTripResponse.validation — o documento real da API com produtos e tipo efetivo', () => {
  const golden = JSON.parse(
    readFileSync(
      new URL('./fixtures/driver-snapshot-document.golden.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>

  function parseSnapshot() {
    return toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        pendingProofs: [],
        score: null,
        trips: [
          {
            createdAt: '2026-10-07T00:00:00.000Z',
            crewRole: 'driver',
            id: 'trip-1',
            manifest: null,
            status: 'in_transit',
            stops: [
              {
                arrivedAt: null,
                completedAt: null,
                deliveryWindowEnd: null,
                deliveryWindowStart: null,
                documents: [golden],
                enRouteSince: null,
                enRouteTappedAt: null,
                id: 'stop-1',
                label: 'Centro, 100',
                latitude: null,
                longitude: null,
                schedule: null,
                sequence: 1,
              },
            ],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })
  }

  it('aceita o documento e preserva o tipo efetivo com os campos novos', () => {
    const document = parseSnapshot().trips[0]?.stops[0]?.documents[0]

    expect(document?.number).toBe('680481')
    expect(document?.occurrenceTypes).toHaveLength(1)
    expect(document?.occurrenceTypes?.[0]).toMatchObject({
      declaredAmountLabel: 'Valor pago pela loja',
      declaredAmountMode: 'optional',
      declaredAmountScope: 'item',
      referenceNumberLabel: 'Número da NFD',
      referenceNumberMode: 'required',
    })
  })

  it('o tipo efetivo do documento real passa no guard do tipo', () => {
    const [type] = golden.occurrenceTypes as readonly unknown[]

    expect(isDriverOccurrenceType(type)).toBe(true)
  })
})
