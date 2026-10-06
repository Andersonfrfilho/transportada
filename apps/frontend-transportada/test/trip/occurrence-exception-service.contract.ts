/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3/T5.3b: as edições da lista de exceções (o `PUT` leva as duas listas inteiras) e a
 * regra dos momentos do tipo. Dados sintéticos.
 */
import { describe, expect, test } from 'bun:test'

import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import trip from '@/modules/trip/locales/trip.locale.json'
import type { OccurrenceAttachmentOverrides } from '@/modules/trip/shared/occurrence.constant'
import {
  addException,
  canEditExceptionItemsMinimum,
  countExceptions,
  editException,
  removeException,
} from '@/modules/trip/shared/occurrenceException.service'
import { OCCURRENCE_TYPE_MOMENTS_ERROR } from '@/modules/trip/shared/occurrenceMoment.constant'
import {
  readOccurrenceMomentsProblem,
  toOccurrenceMoments,
} from '@/modules/trip/shared/occurrenceMoments.service'
import { resolveTripFeedbackKey } from '@/modules/trip/shared/tripFeedback.service'

const BASE: OccurrenceAttachmentOverrides = {
  contractorOverrides: [
    {
      attachmentMode: 'optional',
      contractorId: 'contractor-1',
      itemsMinimumCount: 3,
      itemsMode: 'required',
      noteMode: null,
      photoMinimumCount: null,
      signatureMode: 'required',
    },
  ],
  recipientOverrides: [{ attachmentMode: 'off', taxId: '12345678000190' }],
}
const CONTRACTOR = { contractorId: 'contractor-1', kind: 'contractor' } as const
const RECIPIENT = { kind: 'recipient', taxId: '12345678000190' } as const

describe('exceções: edição devolve as duas listas inteiras (RF4)', () => {
  test('editar um campo mantém os outros como estão, nulos inclusive', () => {
    const next = editException(BASE, CONTRACTOR, { noteMode: 'required' })
    expect(next.contractorOverrides[0]?.noteMode).toBe('required')
    expect(next.contractorOverrides[0]?.signatureMode).toBe('required')
    expect(next.contractorOverrides[0]?.photoMinimumCount).toBeNull()
    expect(next.recipientOverrides).toEqual(BASE.recipientOverrides)
  })

  test('sair de Produtos obrigatório manda o mínimo nulo explícito', () => {
    const next = editException(BASE, CONTRACTOR, { itemsMode: 'optional' })
    expect(next.contractorOverrides[0]).toHaveProperty('itemsMinimumCount')
    expect(next.contractorOverrides[0]?.itemsMinimumCount).toBeNull()
  })

  test('voltar Produtos a "igual ao tipo" também zera o mínimo', () => {
    const next = editException(BASE, CONTRACTOR, { itemsMode: null })
    expect(next.contractorOverrides[0]?.itemsMode).toBeNull()
    expect(next.contractorOverrides[0]?.itemsMinimumCount).toBeNull()
  })

  test('o mínimo de produtos só entra com Produtos obrigatório na própria exceção', () => {
    const inherits = editException(BASE, RECIPIENT, { itemsMinimumCount: 2 })
    expect(inherits.recipientOverrides[0]).not.toHaveProperty('itemsMinimumCount')
    const required = editException(BASE, CONTRACTOR, { itemsMinimumCount: 5 })
    expect(required.contractorOverrides[0]?.itemsMinimumCount).toBe(5)
    expect(canEditExceptionItemsMinimum({ itemsMode: null })).toBe(false)
    expect(canEditExceptionItemsMinimum({ itemsMode: 'optional' })).toBe(false)
    expect(canEditExceptionItemsMinimum({ itemsMode: 'required' })).toBe(true)
  })

  test('remover tira só aquela exceção; adicionar nasce herdando tudo menos a foto', () => {
    expect(countExceptions(BASE)).toBe(2)
    expect(countExceptions(undefined)).toBe(0)
    const removed = removeException(BASE, RECIPIENT)
    expect(removed.recipientOverrides).toHaveLength(0)
    expect(removed.contractorOverrides).toHaveLength(1)
    const added = addException(BASE, {
      attachmentMode: 'required',
      key: { kind: 'recipient', taxId: '98765432000110' },
    })
    /** Os cinco campos herdam por nulo EXPLÍCITO: a API, para tolerar o painel antigo, grava a observação seguindo a foto quando a chave falta. */
    expect(added.recipientOverrides[1]).toEqual({
      attachmentMode: 'required',
      itemsMinimumCount: null,
      itemsMode: null,
      noteMode: null,
      photoMinimumCount: null,
      signatureMode: null,
      taxId: '98765432000110',
    })
    for (const field of ['itemsMode', 'noteMode', 'photoMinimumCount', 'signatureMode']) {
      expect(added.recipientOverrides[1]).toHaveProperty(field)
    }
  })
})

describe('momentos do tipo (T5.3b, RF0)', () => {
  test('conjunto vazio é recusado, nota e parada juntas também, o resto passa', () => {
    expect(readOccurrenceMomentsProblem([])).toBe('empty')
    expect(readOccurrenceMomentsProblem(['document', 'stop'])).toBe('documentAndStop')
    expect(readOccurrenceMomentsProblem(['separation', 'document'])).toBeNull()
    expect(readOccurrenceMomentsProblem(['office'])).toBeNull()
  })

  test('texto desconhecido do seletor não vira momento, e a ordem é a canônica', () => {
    expect(toOccurrenceMoments(['stop', 'invented', 'separation'])).toEqual(['separation', 'stop'])
  })
})

describe('recusas dos momentos pela API: um texto por código estável (T5.3b)', () => {
  const CODES = Object.values(OCCURRENCE_TYPE_MOMENTS_ERROR)

  test('cada código resolve a uma chave própria, com texto em pt-BR e em inglês', () => {
    const keys = CODES.map((code) => resolveTripFeedbackKey(new Error(code)))
    expect(new Set(keys).size).toBe(CODES.length)
    for (const key of keys) {
      expect(key).not.toBe('serverRefused')
      const feedback = trip.feedback as Readonly<Record<string, string>>
      const feedbackEn = tripEn.feedback as Readonly<Record<string, string>>
      expect(typeof feedback[key ?? '']).toBe('string')
      expect(typeof feedbackEn[key ?? '']).toBe('string')
      expect(feedback[key ?? '']).not.toBe(feedbackEn[key ?? ''])
    }
  })
})
