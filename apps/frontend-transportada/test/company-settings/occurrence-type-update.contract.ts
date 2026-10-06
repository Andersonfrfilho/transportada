/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF4 (e 242): toda gravação a partir de um tipo existente leva o conjunto completo e
 * mantém a política de reentrega; `itemsMode` só vai quando o seletor Produtos o manda, e Desligado
 * zera a política.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceTypeUpdate,
  type OccurrenceTypeEdit,
} from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

const TYPE: OccurrenceType = {
  active: true,
  allowsMultipleItems: false,
  attachmentMode: 'required',
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: 'trip.occurrence',
  flow: 'stop',
  id: 'type-1',
  itemsMinimumCount: null,
  itemsMode: 'optional',
  leavesDocumentBehind: true,
  name: 'Avaria',
  noteMode: 'required',
  notifies: true,
  photoMinimumCount: 2,
  redeliveryPolicy: 'blocked',
  signatureMode: 'off',
  stage: 'delivery',
}

const NEW_FIELD_KEYS = [
  'itemsMinimumCount',
  'moments',
  'noteMode',
  'photoMinimumCount',
  'signatureMode',
] as const

const EDITS: readonly OccurrenceTypeEdit[] = [
  { active: false },
  { allowsMultipleItems: true },
  { attachmentMode: 'optional' },
  { flow: 'document' },
  { leavesDocumentBehind: false },
  { notifies: false },
  { redeliveryPolicy: 'allowed' },
]

describe('buildOccurrenceTypeUpdate', () => {
  test('sem edição, devolve o conjunto completo do tipo, sem flow nem itemsMode', () => {
    const update = buildOccurrenceTypeUpdate(TYPE)
    expect(update).toEqual({
      active: true,
      allowsMultipleItems: false,
      attachmentMode: 'required',
      emailTemplateKey: 'trip.occurrence',
      leavesDocumentBehind: true,
      name: 'Avaria',
      notifies: true,
      occurrenceTypeId: 'type-1',
      redeliveryPolicy: 'blocked',
      stage: 'delivery',
    })
    expect(update).not.toHaveProperty('itemsMode')
    expect(update).not.toHaveProperty('flow')
  })

  test('cada edição troca só o campo editado e nunca manda itemsMode', () => {
    for (const edit of EDITS) {
      const update = buildOccurrenceTypeUpdate(TYPE, edit)
      expect(update).toMatchObject({ ...buildOccurrenceTypeUpdate(TYPE), ...edit })
      expect(update).not.toHaveProperty('itemsMode')
      expect(update.redeliveryPolicy).toBe(edit.redeliveryPolicy ?? 'blocked')
    }
  })

  test('Produtos Opcional manda itemsMode e mantém a política gravada', () => {
    const update = buildOccurrenceTypeUpdate(TYPE, { itemsMode: 'optional' })
    expect(update.itemsMode).toBe('optional')
    expect(update.redeliveryPolicy).toBe('blocked')
  })

  test('Produtos Desligado manda itemsMode off e zera a política', () => {
    const update = buildOccurrenceTypeUpdate(TYPE, { itemsMode: 'off' })
    expect(update.itemsMode).toBe('off')
    expect(update.redeliveryPolicy).toBe('unset')
  })

  test('os cinco campos novos só vão quando a edição os muda (RF4: ausente é "não mexe")', () => {
    for (const edit of EDITS) {
      const update = buildOccurrenceTypeUpdate(TYPE, edit)
      for (const key of NEW_FIELD_KEYS) expect(update).not.toHaveProperty(key)
    }
    const edits: readonly OccurrenceTypeEdit[] = [
      { noteMode: 'off' },
      { signatureMode: 'required' },
      { photoMinimumCount: 4 },
      { moments: ['document', 'stop'] },
    ]
    for (const edit of edits) {
      const update = buildOccurrenceTypeUpdate(TYPE, edit)
      const [changedKey] = Object.keys(edit)
      expect(update).toMatchObject(edit)
      for (const key of NEW_FIELD_KEYS.filter((candidate) => candidate !== changedKey)) {
        expect(update).not.toHaveProperty(key)
      }
    }
  })

  test('Produtos obrigatório manda itemsMode e, só se a edição trouxe, o mínimo', () => {
    const withoutMinimum = buildOccurrenceTypeUpdate(TYPE, { itemsMode: 'required' })
    expect(withoutMinimum.itemsMode).toBe('required')
    expect(withoutMinimum).not.toHaveProperty('itemsMinimumCount')
    expect(withoutMinimum.redeliveryPolicy).toBe('blocked')

    const withMinimum = buildOccurrenceTypeUpdate(TYPE, {
      itemsMinimumCount: 3,
      itemsMode: 'required',
    })
    expect(withMinimum.itemsMinimumCount).toBe(3)
  })

  test('sair de Produtos obrigatório manda itemsMinimumCount nulo explícito', () => {
    const required: OccurrenceType = { ...TYPE, itemsMinimumCount: 2, itemsMode: 'required' }
    for (const itemsMode of ['optional', 'off'] as const) {
      const update = buildOccurrenceTypeUpdate(required, { itemsMode })
      expect(update).toHaveProperty('itemsMinimumCount')
      expect(update.itemsMinimumCount).toBeNull()
    }
    expect(buildOccurrenceTypeUpdate(required, { itemsMode: 'off' }).redeliveryPolicy).toBe('unset')
  })

  test('o mínimo de produtos só vai com o tipo (já ou agora) obrigatório', () => {
    const required: OccurrenceType = { ...TYPE, itemsMinimumCount: 2, itemsMode: 'required' }
    expect(
      buildOccurrenceTypeUpdate(required, { itemsMinimumCount: null }).itemsMinimumCount,
    ).toBeNull()
    expect(buildOccurrenceTypeUpdate(required, { itemsMinimumCount: 4 }).itemsMinimumCount).toBe(4)
    expect(buildOccurrenceTypeUpdate(TYPE, { itemsMinimumCount: 4 })).not.toHaveProperty(
      'itemsMinimumCount',
    )
  })
})
