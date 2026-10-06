/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (RF8, ADR-0094 §9.4): o formulário da avaria na entrada — a validação ANTES do envio
 * espelha o que o servidor recusa (item obrigatório, quantidade positiva, foto até 512 KiB, observação até
 * 500), a chave de idempotência é estável por tentativa e muda com o conteúdo, e o corpo sai com as listas
 * alinhadas por índice. Sem DOM.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceFingerprint,
  buildOccurrenceFormData,
  resolveOccurrenceItemUnitOptions,
  toggleOccurrenceItem,
  validateOccurrenceDraft,
  type OccurrenceDraft,
} from '@/modules/cargo-receiving/shared/cargoOccurrenceForm.validation'
import { CARGO_OCCURRENCE_LIMITS } from '@/modules/cargo-receiving/shared/cargoOccurrence.constant'
import { resolveIdempotencyAttempt } from '@/modules/cargo-receiving/shared/cargoIdempotencyKey.service'

import {
  buildProduct,
  DAMAGE_TYPE_ID,
  RECEIVING_TYPES,
  SINGLE_ITEM_TYPE_ID,
} from '../fixtures/cargoOccurrence.fixture'

const PHOTO = {
  id: 'photo-1',
  original: new Blob(['x'.repeat(1024)], { type: 'image/jpeg' }),
  thumbnail: undefined,
}

function draft(overrides: Partial<OccurrenceDraft> = {}): OccurrenceDraft {
  return {
    itemsByCode: new Map([['P-100', { quantity: '', unit: 'CX' }]]),
    note: '',
    photo: PHOTO,
    typeId: DAMAGE_TYPE_ID,
    ...overrides,
  }
}

const damage = RECEIVING_TYPES[0]
const singleItem = RECEIVING_TYPES.find((type) => type.id === SINGLE_ITEM_TYPE_ID)

describe('a validação antes do envio', () => {
  test('o formulário completo não tem recusa', () => {
    expect(validateOccurrenceDraft({ draft: draft(), type: damage })).toEqual({})
  })

  test('sem tipo, sem item e sem foto: as três recusas saem juntas, cada uma no seu campo', () => {
    const issues = validateOccurrenceDraft({
      draft: draft({ itemsByCode: new Map(), photo: undefined, typeId: '' }),
      type: undefined,
    })

    expect(issues.occurrenceTypeId?.code).toBe('required')
    expect(issues.productCodes?.code).toBe('itemsRequired')
    expect(issues.file?.code).toBe('photoRequired')
  })

  test('quantidade é opcional, mas quando existe é decimal positivo (vírgula vale)', () => {
    for (const quantity of ['', '2', '2,5', '0.25', '10.125']) {
      const withQuantity = draft({ itemsByCode: new Map([['P-100', { quantity, unit: 'CX' }]]) })
      expect(validateOccurrenceDraft({ draft: withQuantity, type: damage })).toEqual({})
    }
    for (const quantity of ['0', '0,0', '-1', 'dois', '1.2.3', '1e3', '1,2345']) {
      const invalid = draft({ itemsByCode: new Map([['P-100', { quantity, unit: 'CX' }]]) })
      expect(
        validateOccurrenceDraft({ draft: invalid, type: damage }).productQuantities?.code,
      ).toBe('quantityInvalid')
    }
  })

  test('a foto passa até 512 KiB e a maior que isso é recusada com o teto no texto', () => {
    const atLimit = new Blob([new Uint8Array(CARGO_OCCURRENCE_LIMITS.photoMaxBytes)])
    const overLimit = new Blob([new Uint8Array(CARGO_OCCURRENCE_LIMITS.photoMaxBytes + 1)])

    expect(
      validateOccurrenceDraft({
        draft: draft({ photo: { ...PHOTO, original: atLimit } }),
        type: damage,
      }),
    ).toEqual({})
    const issues = validateOccurrenceDraft({
      draft: draft({ photo: { ...PHOTO, original: overLimit } }),
      type: damage,
    })
    expect(issues.file).toEqual({ code: 'photoTooLarge', max: 512 })
  })

  test('a observação vai até 500 caracteres, contados sem as pontas', () => {
    const atLimit = ` ${'a'.repeat(CARGO_OCCURRENCE_LIMITS.noteMaxLength)} `
    const overLimit = 'a'.repeat(CARGO_OCCURRENCE_LIMITS.noteMaxLength + 1)

    expect(validateOccurrenceDraft({ draft: draft({ note: atLimit }), type: damage })).toEqual({})
    expect(
      validateOccurrenceDraft({ draft: draft({ note: overLimit }), type: damage }).note,
    ).toEqual({
      code: 'tooLong',
      max: 500,
    })
  })

  test('tipo de um item só recusa mais de um item marcado', () => {
    const two = draft({
      itemsByCode: new Map([
        ['P-100', { quantity: '', unit: 'CX' }],
        ['P-200', { quantity: '', unit: 'KG' }],
      ]),
      typeId: SINGLE_ITEM_TYPE_ID,
    })

    expect(validateOccurrenceDraft({ draft: two, type: singleItem }).productCodes?.code).toBe(
      'singleItem',
    )
    expect(validateOccurrenceDraft({ draft: two, type: damage })).toEqual({})
  })

  test('tipo sem itens (`off`) não exige nem oferece item', () => {
    const off = { ...(damage as NonNullable<typeof damage>), itemsMode: 'off' as const }

    expect(
      validateOccurrenceDraft({ draft: draft({ itemsByCode: new Map() }), type: off }),
    ).toEqual({})
  })
})

describe('marcar itens', () => {
  const product = buildProduct({ code: 'P-100', commercialUnit: 'CX' })

  test('marcar põe o item com a unidade comercial dele e desmarcar o tira', () => {
    const marked = toggleOccurrenceItem({ allowsMultipleItems: true, items: new Map(), product })
    expect([...marked]).toEqual([['P-100', { quantity: '', unit: 'CX' }]])
    expect(toggleOccurrenceItem({ allowsMultipleItems: true, items: marked, product }).size).toBe(0)
  })

  test('item sem unidade comercial nasce em "unit"; tipo de um item só troca o marcado', () => {
    const loose = buildProduct({ code: 'P-300', commercialUnit: '' })
    const first = toggleOccurrenceItem({
      allowsMultipleItems: false,
      items: new Map(),
      product: loose,
    })
    expect(first.get('P-300')?.unit).toBe('unit')

    const swapped = toggleOccurrenceItem({ allowsMultipleItems: false, items: first, product })
    expect([...swapped.keys()]).toEqual(['P-100'])
  })

  test('as unidades oferecidas: a comercial primeiro, depois caixa e unidade, sem repetir', () => {
    expect(resolveOccurrenceItemUnitOptions('KG')).toEqual(['KG', 'box', 'unit'])
    expect(resolveOccurrenceItemUnitOptions('box')).toEqual(['box', 'unit'])
    expect(resolveOccurrenceItemUnitOptions('')).toEqual(['box', 'unit'])
  })
})

describe('o corpo do envio', () => {
  test('lista alinhada por índice: item sem contagem vai em branco, nos dois campos', () => {
    const form = buildOccurrenceFormData({
      draft: draft({
        itemsByCode: new Map([
          ['P-100', { quantity: '3', unit: 'CX' }],
          ['P-200', { quantity: '', unit: 'KG' }],
          ['P-300', { quantity: '1,5', unit: 'unit' }],
        ]),
        note: '  amassada  ',
      }),
    })

    expect(form.getAll('productCodes')).toEqual(['P-100', 'P-200', 'P-300'])
    expect(form.getAll('productQuantities')).toEqual(['3', '', '1.5'])
    expect(form.getAll('productQuantityUnits')).toEqual(['CX', '', 'unit'])
    expect(form.get('note')).toBe('amassada')
  })

  test('sem miniatura, o campo `thumbnail` não vai', () => {
    expect(buildOccurrenceFormData({ draft: draft() }).has('thumbnail')).toBe(false)
  })
})

describe('a chave de idempotência (uma por tentativa)', () => {
  const generated: string[] = []
  const generateKey = () => {
    const key = `chave-${String(generated.length + 1).padStart(16, '0')}`
    generated.push(key)
    return key
  }

  test('o mesmo envio repetido reaproveita a chave; conteúdo diferente ganha chave nova', () => {
    generated.length = 0
    const fingerprint = buildOccurrenceFingerprint({ documentId: 'doc-1', draft: draft() })

    const first = resolveIdempotencyAttempt({ fingerprint, generateKey, previous: undefined })
    const again = resolveIdempotencyAttempt({ fingerprint, generateKey, previous: first })
    expect(again.key).toBe(first.key)
    expect(generated).toHaveLength(1)

    const changed = buildOccurrenceFingerprint({
      documentId: 'doc-1',
      draft: draft({ note: 'outra' }),
    })
    expect(
      resolveIdempotencyAttempt({ fingerprint: changed, generateKey, previous: first }).key,
    ).not.toBe(first.key)
  })

  test('trocar a foto, a nota, a nota fiscal ou a ordem dos itens muda a impressão', () => {
    const base = buildOccurrenceFingerprint({ documentId: 'doc-1', draft: draft() })
    const otherPhoto = buildOccurrenceFingerprint({
      documentId: 'doc-1',
      draft: draft({ photo: { ...PHOTO, id: 'photo-2' } }),
    })
    const otherDocument = buildOccurrenceFingerprint({ documentId: 'doc-2', draft: draft() })
    expect(otherPhoto).not.toBe(base)
    expect(otherDocument).not.toBe(base)

    const ab = draft({
      itemsByCode: new Map([
        ['P-100', { quantity: '', unit: 'CX' }],
        ['P-200', { quantity: '', unit: 'KG' }],
      ]),
    })
    const ba = draft({
      itemsByCode: new Map([
        ['P-200', { quantity: '', unit: 'KG' }],
        ['P-100', { quantity: '', unit: 'CX' }],
      ]),
    })
    // O servidor imprime a lista na ordem enviada: a mesma chave com outra ordem seria 409 de reuso.
    expect(buildOccurrenceFingerprint({ documentId: 'doc-1', draft: ab })).not.toBe(
      buildOccurrenceFingerprint({ documentId: 'doc-1', draft: ba }),
    )
  })
})
