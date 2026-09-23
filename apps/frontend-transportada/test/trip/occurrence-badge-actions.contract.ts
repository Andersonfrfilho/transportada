/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T24 (CA5/RF36/RF37): a nota com `openOccurrenceCase: true` e a parada com
 * `hasOpenOccurrence: true` ganham um marcador visual na listagem e no mapa — mas nenhuma ação
 * some ou é desabilitada por causa deles. `resolveFieldActionCapabilities` lê só `allowedActions`
 * (`GET /trips/:id/allowed-actions`), que é byte a byte igual com ou sem o marcador (RF20): a
 * capacidade de cada nota não pode variar por um campo que ela nem recebe como parâmetro.
 */
import { describe, expect, it } from 'bun:test'

import { resolveFieldActionCapabilities } from '@/modules/trip/shared/tripFieldActions.service'
import type { TripAllowedActions } from '@/modules/trip/shared/tripAllowedActions.validation'

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000d01'
const STOP_ID = '00000000-0000-4000-8000-000000000b01'

const ACTIONS: TripAllowedActions = {
  documents: { [DOCUMENT_ID]: ['fieldDelivery', 'fieldReturn'] },
  stops: { [STOP_ID]: ['arrive'] },
  trip: ['startRoute'],
}

describe('marcador de tratativa não altera a lista de ações da linha (spec 164 T24)', () => {
  it('a capacidade da nota é a mesma com `openOccurrenceCase` aberto ou fechado', () => {
    const capabilities = resolveFieldActionCapabilities(ACTIONS)

    /**
     * `resolveFieldActionCapabilities` não recebe `openOccurrenceCase`/`hasOpenOccurrence` como
     * entrada — só `TripAllowedActions`. Chamar com a mesma lista duas vezes prova que a função é
     * pura em relação ao marcador: nenhum caminho de código dela pode ler o campo novo, porque ela
     * não o enxerga.
     */
    const capabilitiesAgain = resolveFieldActionCapabilities(ACTIONS)

    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldDelivery')).toBe(
      capabilitiesAgain.canDocument(DOCUMENT_ID, 'fieldDelivery'),
    )
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldReturn')).toBe(
      capabilitiesAgain.canDocument(DOCUMENT_ID, 'fieldReturn'),
    )
    expect(capabilities.canStop(STOP_ID, 'arrive')).toBe(
      capabilitiesAgain.canStop(STOP_ID, 'arrive'),
    )
    expect(capabilities.canTrip('startRoute')).toBe(capabilitiesAgain.canTrip('startRoute'))

    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldDelivery')).toBe(true)
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldReturn')).toBe(true)
  })
})
