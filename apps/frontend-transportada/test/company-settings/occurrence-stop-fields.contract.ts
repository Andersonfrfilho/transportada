/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 315 RF6: localização, horário de chegada e espera mínima do tipo de parada — quando a tela os oferece e como
 * cada edição se monta (ligar a espera desliga o horário digitado, que a API recusaria junto).
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import {
  buildOccurrenceMinWaitEdit,
  buildOccurrenceStopEdit,
  hasOccurrenceMinWait,
  listOccurrenceMinWaitChoices,
  readOccurrenceStopFields,
  readOccurrenceStopMode,
} from '@/modules/trip/shared/occurrenceStopFields.service'
import { buildOccurrenceTypeUpdate } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const STOP_TYPE: OccurrenceType = {
  active: true,
  allowsMultipleItems: false,
  arrivalTimeMode: 'required',
  attachmentMode: 'required',
  emailTemplateKey: 'trip.occurrence',
  flow: 'stop',
  id: 'type-1',
  itemsMinimumCount: null,
  itemsMode: 'off',
  leavesDocumentBehind: false,
  locationMode: 'optional',
  minWaitAfterArrivalMinutes: null,
  name: 'Local fechado',
  noteMode: 'optional',
  notifies: true,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
}

describe('a tela oferece os campos da parada só onde valem (spec 315 RF6)', () => {
  test('tipo de parada sem momento de nota mostra localização, horário e observação', () => {
    expect(readOccurrenceStopFields(STOP_TYPE)).toEqual(['location', 'arrivalTime', 'note'])
    expect(hasOccurrenceMinWait(STOP_TYPE)).toBe(true)
  })

  test('tipo de nota não mostra nada: o momento parada não está no conjunto', () => {
    const documentType: OccurrenceType = { ...STOP_TYPE, flow: 'document' }

    expect(readOccurrenceStopFields(documentType)).toEqual([])
    expect(hasOccurrenceMinWait(documentType)).toBe(false)
  })

  test('API anterior aos campos não manda nenhum e a tela não oferece o que ela recusaria', () => {
    const old: Record<string, unknown> = { ...STOP_TYPE }
    delete old.arrivalTimeMode
    delete old.locationMode
    delete old.minWaitAfterArrivalMinutes
    const oldType = old as unknown as OccurrenceType

    expect(readOccurrenceStopFields(oldType)).toEqual(['note'])
    expect(hasOccurrenceMinWait(oldType)).toBe(false)
    expect(readOccurrenceStopMode(oldType, 'location')).toBe('off')
  })
})

describe('as edições da parada (spec 315 RF6, D10)', () => {
  test('o modo de localização edita só a localização', () => {
    expect(buildOccurrenceStopEdit(STOP_TYPE, 'location', 'required')).toEqual({
      locationMode: 'required',
    })
  })

  test('pedir o horário com a espera ligada desliga a espera na mesma edição', () => {
    const waiting: OccurrenceType = {
      ...STOP_TYPE,
      arrivalTimeMode: 'off',
      minWaitAfterArrivalMinutes: 30,
    }

    expect(buildOccurrenceStopEdit(waiting, 'arrivalTime', 'required')).toEqual({
      arrivalTimeMode: 'required',
      minWaitAfterArrivalMinutes: null,
    })
    expect(buildOccurrenceStopEdit(STOP_TYPE, 'arrivalTime', 'optional')).toEqual({
      arrivalTimeMode: 'optional',
    })
  })

  test('ligar a espera desliga o horário digitado; desligar a espera manda nulo', () => {
    expect(buildOccurrenceMinWaitEdit('30')).toEqual({
      arrivalTimeMode: 'off',
      minWaitAfterArrivalMinutes: 30,
    })
    expect(buildOccurrenceMinWaitEdit('off')).toEqual({ minWaitAfterArrivalMinutes: null })
  })

  test('o valor gravado fora da lista aparece nas opções, ordenado', () => {
    expect(listOccurrenceMinWaitChoices({ ...STOP_TYPE, minWaitAfterArrivalMinutes: 50 })).toEqual([
      15, 30, 45, 50, 60, 90, 120,
    ])
  })

  test('a gravação leva a espera mínima e o modo quando a edição os traz — e mais nada', () => {
    const body = buildOccurrenceTypeUpdate(STOP_TYPE, buildOccurrenceMinWaitEdit('30'))

    expect(body.minWaitAfterArrivalMinutes).toBe(30)
    expect(body.arrivalTimeMode).toBe('off')
    expect(body.locationMode).toBeUndefined()
  })
})

describe('a lista de tipos de rua tolera os campos da parada (spec 315, ADR-0081 §9)', () => {
  const adapters = createTripResponseAdapters()
  const FIELD_TYPE = { id: '54ed0225-f293-47c3-84fe-0b66eff68784', name: 'Local fechado' }

  test('aceita sem as chaves (API anterior) e com elas (API nova)', () => {
    expect(adapters.fieldOccurrenceTypesFromApi([FIELD_TYPE])).toHaveLength(1)
    expect(
      adapters.fieldOccurrenceTypesFromApi([
        {
          ...FIELD_TYPE,
          arrivalTimeMode: 'required',
          locationMode: 'optional',
          minWaitAfterArrivalMinutes: null,
        },
      ]),
    ).toHaveLength(1)
  })
})
