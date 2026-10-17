/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.2 (ADR-0107, D3/D4/D6): a política pura do escopo de contratantes.
 */
import { describe, expect, test } from 'bun:test'

import {
  assertOccurrenceTypeContractorScopeIsWritable,
  isOccurrenceTypeAvailableForContractor,
  OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE,
  validateOccurrenceTypeContractorScope,
} from '../../src/trips/domain/occurrence-type-contractor-scope.policy.js'
import {
  OccurrenceTypeContractorScopeEmptyError,
  OccurrenceTypeContractorScopeInvalidError,
  OccurrenceTypeContractorScopeNeedsDocumentError,
} from '../../src/trips/domain/occurrence-type-contractor-scope.error.js'

const ZARAGOZA = '11111111-1111-4111-8111-111111111111'
const RIBER = '22222222-2222-4222-8222-222222222222'

describe('spec 270 T2.2: isOccurrenceTypeAvailableForContractor', () => {
  test('all vale para qualquer contratante e para a nota sem contratante', () => {
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: ZARAGOZA,
        contractorIds: [],
        scope: 'all',
      }),
    ).toBe(true)
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: undefined,
        contractorIds: [],
        scope: 'all',
      }),
    ).toBe(true)
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: null,
        contractorIds: [],
        scope: 'all',
      }),
    ).toBe(true)
  })

  test('all ignora linhas que sobraram na lista (defesa do leitor)', () => {
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: RIBER,
        contractorIds: [ZARAGOZA],
        scope: 'all',
      }),
    ).toBe(true)
  })

  test('listed vale só para a contratante dentro da lista', () => {
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: ZARAGOZA,
        contractorIds: [ZARAGOZA],
        scope: 'listed',
      }),
    ).toBe(true)
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: RIBER,
        contractorIds: [ZARAGOZA],
        scope: 'listed',
      }),
    ).toBe(false)
  })

  test('listed não vale para a nota sem contratante (D4)', () => {
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: undefined,
        contractorIds: [ZARAGOZA],
        scope: 'listed',
      }),
    ).toBe(false)
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: null,
        contractorIds: [ZARAGOZA],
        scope: 'listed',
      }),
    ).toBe(false)
  })

  test('listed com lista vazia não vale para ninguém', () => {
    expect(
      isOccurrenceTypeAvailableForContractor({
        contractorId: ZARAGOZA,
        contractorIds: [],
        scope: 'listed',
      }),
    ).toBe(false)
  })
})

describe('spec 270 T2.2: validateOccurrenceTypeContractorScope', () => {
  test('all sem lista e listed com lista e momento de nota são válidos', () => {
    expect(
      validateOccurrenceTypeContractorScope({
        contractorIds: [],
        moments: ['document'],
        scope: 'all',
      }),
    ).toEqual([])
    expect(
      validateOccurrenceTypeContractorScope({
        contractorIds: [ZARAGOZA],
        moments: ['document'],
        scope: 'listed',
      }),
    ).toEqual([])
  })

  test('listed com stop e office é válido (R1: o escopo vale no lote do escritório)', () => {
    expect(
      validateOccurrenceTypeContractorScope({
        contractorIds: [ZARAGOZA],
        moments: ['stop', 'office'],
        scope: 'listed',
      }),
    ).toEqual([])
  })

  test('lista vazia em listed', () => {
    expect(
      validateOccurrenceTypeContractorScope({
        contractorIds: [],
        moments: ['document'],
        scope: 'listed',
      }),
    ).toEqual([OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.empty])
  })

  test('all com lista', () => {
    expect(
      validateOccurrenceTypeContractorScope({
        contractorIds: [ZARAGOZA],
        moments: ['document'],
        scope: 'all',
      }),
    ).toEqual([OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.listNotAllowed])
  })

  test('tipo só de parada não pode ser listed', () => {
    expect(
      validateOccurrenceTypeContractorScope({
        contractorIds: [ZARAGOZA],
        moments: ['stop'],
        scope: 'listed',
      }),
    ).toEqual([OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.needsDocument])
  })

  test('stop com document é assunto da 246: a política do escopo não repete o erro', () => {
    expect(
      validateOccurrenceTypeContractorScope({
        contractorIds: [ZARAGOZA],
        moments: ['stop', 'document'],
        scope: 'listed',
      }),
    ).toEqual([])
  })

  test('devolve todos os erros de uma vez', () => {
    expect(
      validateOccurrenceTypeContractorScope({
        contractorIds: [],
        moments: ['stop'],
        scope: 'listed',
      }),
    ).toEqual([
      OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.empty,
      OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.needsDocument,
    ])
  })
})

describe('spec 270 T2.2: assertOccurrenceTypeContractorScopeIsWritable', () => {
  test('não lança quando válido', () => {
    expect(() =>
      assertOccurrenceTypeContractorScopeIsWritable({
        contractorIds: [ZARAGOZA],
        moments: ['document'],
        scope: 'listed',
      }),
    ).not.toThrow()
  })

  test('lança o erro do primeiro problema, com todos nos detalhes', () => {
    try {
      assertOccurrenceTypeContractorScopeIsWritable({
        contractorIds: [],
        moments: ['stop'],
        scope: 'listed',
      })
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(OccurrenceTypeContractorScopeEmptyError)
      expect((error as OccurrenceTypeContractorScopeEmptyError).details).toEqual([
        { field: 'contractorIds', message: OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.empty },
        { field: 'contractorScope', message: OCCURRENCE_TYPE_CONTRACTOR_SCOPE_ISSUE.needsDocument },
      ])
    }
  })

  test('mapeia cada problema ao seu erro', () => {
    expect(() =>
      assertOccurrenceTypeContractorScopeIsWritable({
        contractorIds: [ZARAGOZA],
        moments: ['stop'],
        scope: 'listed',
      }),
    ).toThrow(OccurrenceTypeContractorScopeNeedsDocumentError)
    expect(() =>
      assertOccurrenceTypeContractorScopeIsWritable({
        contractorIds: [ZARAGOZA],
        moments: ['document'],
        scope: 'all',
      }),
    ).toThrow(OccurrenceTypeContractorScopeInvalidError)
  })
})
