/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3/T5.3b: as edições da lista de exceções (o `PUT` leva as duas listas inteiras) e a
 * regra dos momentos do tipo. Dados sintéticos.
 */
import { describe, expect, test } from 'bun:test'

import type { OccurrenceAttachmentOverrides } from '@/modules/trip/shared/occurrence.constant'
import {
  addException,
  canEditExceptionItemsMinimum,
  countExceptions,
  editException,
  removeException,
} from '@/modules/trip/shared/occurrenceException.service'

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
    expect(added.recipientOverrides[1]).toEqual({
      attachmentMode: 'required',
      taxId: '98765432000110',
    })
  })
})
