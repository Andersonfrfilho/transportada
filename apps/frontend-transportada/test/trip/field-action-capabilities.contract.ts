/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  canOfferStopFieldAction,
  canOfferTripFieldAction,
  hasMultipleDrivers,
  resolveDefaultOnBehalfDriverId,
  resolveFieldActionCapabilities,
  selectFieldActionableDocumentIds,
  selectFieldReturnableDocumentIds,
} from '../../src/modules/trip/shared/tripFieldActions.service'
import type { TripAllowedActions } from '../../src/modules/trip/shared/tripAllowedActions.validation'

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000d01'
const STOP_ID = '00000000-0000-4000-8000-000000000b01'

/**
 * Spec 156 T8: sem a lista (hook com resposta ausente/malformada — a consulta ainda não voltou, a
 * API é antiga na janela de deploy, ou `parseTripAllowedActions` recusou o corpo), nenhuma ação de
 * campo aparece. Falha **fechada**.
 */
describe('resolveFieldActionCapabilities (spec 156 T8)', () => {
  it('sem resposta, nenhuma ação de campo aparece', () => {
    const capabilities = resolveFieldActionCapabilities(undefined)

    expect(capabilities.canTrip('startRoute')).toBe(false)
    expect(capabilities.canStop(STOP_ID, 'arrive')).toBe(false)
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldDelivery')).toBe(false)
  })

  it('lê a ação da viagem, da parada e da nota quando a lista responde', () => {
    const actions: TripAllowedActions = {
      documents: { [DOCUMENT_ID]: ['fieldDelivery', 'fieldReturn'] },
      stops: { [STOP_ID]: ['arrive', 'occurrence'] },
      trip: ['confirmLoad', 'startRoute'],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(capabilities.canTrip('startRoute')).toBe(true)
    expect(capabilities.canTrip('cancel')).toBe(false)
    expect(capabilities.canStop(STOP_ID, 'arrive')).toBe(true)
    expect(capabilities.canStop('outra-parada', 'arrive')).toBe(false)
    /**
     * Aceite 4 (D10): em `on_delivery_route`, uma nota `loaded` recebe `fieldDelivery`/
     * `fieldReturn` — a T11 é quem oferece o assistente, mas a capacidade já precisa surgir aqui.
     */
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldDelivery')).toBe(true)
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldReturn')).toBe(true)
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldOccurrence')).toBe(false)
  })
})

describe('resolveDefaultOnBehalfDriverId / hasMultipleDrivers (spec 156 D3)', () => {
  it('escolhe o motorista de position 1 por padrão', () => {
    const drivers = [
      { driverId: 'driver-2', position: 2 },
      { driverId: 'driver-1', position: 1 },
    ]

    expect(resolveDefaultOnBehalfDriverId(drivers)).toBe('driver-1')
  })

  it('sem motorista de position 1, não escolhe nenhum', () => {
    expect(resolveDefaultOnBehalfDriverId([{ driverId: 'driver-2', position: 2 }])).toBeUndefined()
    expect(resolveDefaultOnBehalfDriverId([])).toBeUndefined()
  })

  it('o seletor só aparece com mais de um motorista', () => {
    expect(hasMultipleDrivers([])).toBe(false)
    expect(hasMultipleDrivers([{ driverId: 'driver-1' }])).toBe(false)
    expect(hasMultipleDrivers([{ driverId: 'driver-1' }, { driverId: 'driver-2' }])).toBe(true)
  })
})

/**
 * Spec 156 T8b (revisão do code-reviewer): a mesma checagem que decide o botão da linha decide o
 * que "Devolver" em massa manda — extraída para função pura por não haver suíte de render aqui.
 */
describe('selectFieldReturnableDocumentIds (spec 156 T8b)', () => {
  const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000d02'

  it('mantém só as notas com fieldReturn na lista', () => {
    const actions: TripAllowedActions = {
      documents: {
        [DOCUMENT_ID]: ['fieldReturn'],
        [OTHER_DOCUMENT_ID]: ['fieldDelivery'],
      },
      stops: {},
      trip: [],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      selectFieldReturnableDocumentIds({
        capabilities,
        documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
      }),
    ).toEqual([DOCUMENT_ID])
  })

  it('sem allowedActions, nenhuma nota é enviada — falha fechada', () => {
    const capabilities = resolveFieldActionCapabilities(undefined)

    expect(selectFieldReturnableDocumentIds({ capabilities, documentIds: [DOCUMENT_ID] })).toEqual(
      [],
    )
  })
})

/**
 * A4d (spec 156 T15): a mesma régua da devolução vale para baixa e ocorrência em massa — a base
 * genérica por trás de `selectFieldReturnableDocumentIds`.
 */
describe('selectFieldActionableDocumentIds (spec 156 T15, A4d)', () => {
  const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000d03'

  it('mantém só as notas com a capacidade pedida (fieldOccurrence)', () => {
    const actions: TripAllowedActions = {
      documents: {
        [DOCUMENT_ID]: ['fieldOccurrence'],
        [OTHER_DOCUMENT_ID]: ['fieldDelivery'],
      },
      stops: {},
      trip: [],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      selectFieldActionableDocumentIds({
        action: 'fieldOccurrence',
        capabilities,
        documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
      }),
    ).toEqual([DOCUMENT_ID])
  })

  it('mantém só as notas com a capacidade pedida (fieldDelivery)', () => {
    const actions: TripAllowedActions = {
      documents: {
        [DOCUMENT_ID]: ['fieldOccurrence'],
        [OTHER_DOCUMENT_ID]: ['fieldDelivery'],
      },
      stops: {},
      trip: [],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      selectFieldActionableDocumentIds({
        action: 'fieldDelivery',
        capabilities,
        documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
      }),
    ).toEqual([OTHER_DOCUMENT_ID])
  })

  it('nota nova/desconhecida (fora de allowedActions) é ignorada, não recusa o lote inteiro', () => {
    const actions: TripAllowedActions = {
      documents: { [DOCUMENT_ID]: ['fieldDelivery'] },
      stops: {},
      trip: [],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      selectFieldActionableDocumentIds({
        action: 'fieldDelivery',
        capabilities,
        documentIds: [DOCUMENT_ID, 'nota-desconhecida'],
      }),
    ).toEqual([DOCUMENT_ID])
  })
})

/**
 * Spec 180: registrar chegada/ocorrência de parada deixa de morar num painel próprio
 * (`TripFieldActions`) e passa para a linha da parada em `TripStopList` — o botão só aparece com
 * `canReportOnBehalf` **e** a capacidade da parada, nunca com um dos dois sozinho.
 */
describe('canOfferStopFieldAction (spec 180)', () => {
  it('oferece quando canReportOnBehalf é true e a parada tem a capacidade', () => {
    const actions: TripAllowedActions = {
      documents: {},
      stops: { [STOP_ID]: ['arrive', 'occurrence'] },
      trip: [],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      canOfferStopFieldAction({
        action: 'arrive',
        canReportOnBehalf: true,
        capabilities,
        stopId: STOP_ID,
      }),
    ).toBe(true)
    expect(
      canOfferStopFieldAction({
        action: 'occurrence',
        canReportOnBehalf: true,
        capabilities,
        stopId: STOP_ID,
      }),
    ).toBe(true)
  })

  it('sem canReportOnBehalf, não oferece mesmo com a capacidade na parada', () => {
    const actions: TripAllowedActions = {
      documents: {},
      stops: { [STOP_ID]: ['arrive', 'occurrence'] },
      trip: [],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      canOfferStopFieldAction({
        action: 'arrive',
        canReportOnBehalf: false,
        capabilities,
        stopId: STOP_ID,
      }),
    ).toBe(false)
  })

  it('com canReportOnBehalf, não oferece sem a capacidade na parada', () => {
    const actions: TripAllowedActions = { documents: {}, stops: {}, trip: [] }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      canOfferStopFieldAction({
        action: 'arrive',
        canReportOnBehalf: true,
        capabilities,
        stopId: STOP_ID,
      }),
    ).toBe(false)
  })

  it('sem allowedActions (undefined), falha fechada mesmo com canReportOnBehalf', () => {
    const capabilities = resolveFieldActionCapabilities(undefined)

    expect(
      canOfferStopFieldAction({
        action: 'occurrence',
        canReportOnBehalf: true,
        capabilities,
        stopId: STOP_ID,
      }),
    ).toBe(false)
  })
})

/** Spec 180: mesma régua de `canOfferStopFieldAction`, agora para as ações da viagem inteira. */
describe('canOfferTripFieldAction (spec 180)', () => {
  it('oferece quando canReportOnBehalf é true e a viagem tem a capacidade', () => {
    const actions: TripAllowedActions = {
      documents: {},
      stops: {},
      trip: ['confirmLoad', 'startRoute'],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      canOfferTripFieldAction({ action: 'confirmLoad', canReportOnBehalf: true, capabilities }),
    ).toBe(true)
  })

  it('sem canReportOnBehalf, não oferece mesmo com a capacidade na viagem', () => {
    const actions: TripAllowedActions = { documents: {}, stops: {}, trip: ['startRoute'] }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      canOfferTripFieldAction({ action: 'startRoute', canReportOnBehalf: false, capabilities }),
    ).toBe(false)
  })

  it('com canReportOnBehalf, não oferece sem a capacidade na viagem', () => {
    const actions: TripAllowedActions = { documents: {}, stops: {}, trip: [] }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(
      canOfferTripFieldAction({ action: 'confirmLoad', canReportOnBehalf: true, capabilities }),
    ).toBe(false)
  })
})
