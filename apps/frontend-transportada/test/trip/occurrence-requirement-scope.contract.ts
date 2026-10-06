/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão do painel A2/M2/M5): o que vale para um tipo sai do conjunto de momentos, e não do
 * `stage`. Dados sintéticos.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceMoment, OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import { readOccurrenceRequirementScope } from '@/modules/trip/shared/occurrenceRequirementScope.service'

import {
  OCCURRENCE_REQUIREMENT_DEFAULTS,
  withoutFields,
} from '../fixtures/occurrenceRequirementDefaults.fixture'

function buildType(
  moments: readonly OccurrenceMoment[],
  overrides: Partial<OccurrenceType> = {},
): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'optional',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    moments,
    name: 'Tipo',
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
    ...overrides,
  }
}

describe('escopo das exigências pelo conjunto de momentos', () => {
  test('nota: os quatro campos, os mínimos e as exceções', () => {
    const scope = readOccurrenceRequirementScope(buildType(['document', 'office']))
    expect(scope.typeFields).toEqual(['photo', 'note', 'signature', 'items'])
    expect(scope.hasExceptions).toBe(true)
    expect(scope.hasPhotoMinimum).toBe(true)
    expect(scope.isMixed).toBe(false)
  })

  test('galpão e nota (stage separation): os campos da rua continuam, as exceções também, e a tela avisa', () => {
    const scope = readOccurrenceRequirementScope(
      buildType(['separation', 'document'], { stage: 'separation' }),
    )
    expect(scope.typeFields).toEqual(['photo', 'note', 'signature', 'items'])
    expect(scope.hasExceptions).toBe(true)
    expect(scope.isMixed).toBe(true)
  })

  test('só galpão: só Produtos, sem exceções', () => {
    const scope = readOccurrenceRequirementScope(buildType(['separation'], { stage: 'separation' }))
    expect(scope.typeFields).toEqual(['items'])
    expect(scope.hasExceptions).toBe(false)
    expect(scope.isMixed).toBe(false)
  })

  test('só parada: só a Foto, sem mínimo de fotos, e a exceção também declara só a foto', () => {
    const scope = readOccurrenceRequirementScope(buildType(['stop', 'office'], { flow: 'stop' }))
    expect(scope.typeFields).toEqual(['photo'])
    expect(scope.exceptionFields).toEqual(['photo'])
    expect(scope.hasPhotoMinimum).toBe(false)
    expect(scope.hasExceptions).toBe(true)
    expect(scope.isStopOnly).toBe(true)
  })

  test('API anterior aos campos: Observação, Assinatura e o mínimo de fotos não existem na tela', () => {
    const old = withoutFields(buildType(['document', 'office']), [
      'noteMode',
      'photoMinimumCount',
      'signatureMode',
    ])
    const scope = readOccurrenceRequirementScope(old)
    expect(scope.typeFields).toEqual(['photo', 'items'])
    expect(scope.exceptionFields).toEqual(['photo', 'note', 'signature', 'items'])
    expect(scope.hasPhotoMinimum).toBe(false)
  })

  test('sem moments (API anterior): segue o grupo e o fluxo de hoje', () => {
    const legacy = withoutFields(buildType(['document']), ['moments'])
    expect(readOccurrenceRequirementScope(legacy).typeFields).toEqual([
      'photo',
      'note',
      'signature',
      'items',
    ])
    expect(readOccurrenceRequirementScope({ ...legacy, flow: 'stop' }).typeFields).toEqual([
      'photo',
    ])
    expect(readOccurrenceRequirementScope({ ...legacy, stage: 'separation' }).typeFields).toEqual([
      'items',
    ])
  })
})
