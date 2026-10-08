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

/**
 * Spec 252 T5.1: O painel tolera o campo novo `holidayWarnings` nas paradas antes de a API mandá-lo.
 * Um detalhe de viagem COM e SEM o campo é aceito. Esta é a etapa 1 (painel tolerante)
 * da ADR-0081 §9 e ADR-0100 §6.
 */
describe('tripResponse.validation — tolerância a holidayWarnings (spec 252 T5.1)', () => {
  const adapters = createTripResponseAdapters()

  it('aceita parada sem holidayWarnings (API anterior)', () => {
    const stopWithoutHolidayWarnings = {
      addressKey: 'campinas|03000',
      arrivedAt: null,
      completedAt: null,
      deliveryWindowEnd: '2024-12-25T18:00:00Z',
      deliveryWindowStart: '2024-12-25T09:00:00Z',
      documents: [],
      id: 'stop-1',
      label: 'Campinas',
      sequence: 1,
    }

    const detail = {
      id: 'trip-1',
      companyId: 'company-1',
      createdAt: '2024-12-25T00:00:00Z',
      driverNames: ['João'],
      requiresMdfe: false,
      requiresMdfeReason: null,
      status: 'draft',
      updatedAt: '2024-12-25T00:00:00Z',
      vehicleId: 'vehicle-1',
      documents: [],
      drivers: [
        {
          driverId: 'driver-1',
          driverName: 'João',
          driverEmail: null,
          driverPhone: null,
          driverTaxId: null,
          position: 1,
        },
      ],
      stops: [stopWithoutHolidayWarnings],
    }

    // Should not throw
    const result = adapters.tripDetailFromApi(detail)
    expect(result.stops.length).toBe(1)
    expect(result.stops[0]?.id).toBe('stop-1')
    expect(result.stops[0]?.holidayWarnings).toBeUndefined()
  })

  it('aceita parada COM holidayWarnings (API nova)', () => {
    const stopWithHolidayWarnings = {
      addressKey: 'campinas|03000',
      arrivedAt: null,
      completedAt: null,
      deliveryWindowEnd: '2024-12-25T18:00:00Z',
      deliveryWindowStart: '2024-12-25T09:00:00Z',
      documents: [],
      id: 'stop-1',
      label: 'Campinas',
      sequence: 1,
      holidayWarnings: [
        {
          date: '2024-12-25',
          cityIbgeCode: 3509502,
          cityName: 'Campinas',
          reasons: [
            {
              scope: 'municipal',
              origin: 'imported',
              name: 'Aniversário de Campinas',
            },
          ],
        },
      ],
    }

    const detail = {
      id: 'trip-1',
      companyId: 'company-1',
      createdAt: '2024-12-25T00:00:00Z',
      driverNames: ['João'],
      requiresMdfe: false,
      requiresMdfeReason: null,
      status: 'draft',
      updatedAt: '2024-12-25T00:00:00Z',
      vehicleId: 'vehicle-1',
      documents: [],
      drivers: [
        {
          driverId: 'driver-1',
          driverName: 'João',
          driverEmail: null,
          driverPhone: null,
          driverTaxId: null,
          position: 1,
        },
      ],
      stops: [stopWithHolidayWarnings],
    }

    // Should not throw
    const result = adapters.tripDetailFromApi(detail)
    expect(result.stops.length).toBe(1)
    expect(result.stops[0]?.holidayWarnings).toEqual([
      {
        date: '2024-12-25',
        cityIbgeCode: 3509502,
        cityName: 'Campinas',
        reasons: [
          {
            scope: 'municipal',
            origin: 'imported',
            name: 'Aniversário de Campinas',
          },
        ],
      },
    ])
  })
})
