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
  itemsMode: 'optional',
  leavesDocumentBehind: true,
  name: 'Avaria',
  notifies: true,
  redeliveryPolicy: 'blocked',
  stage: 'delivery',
}

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
})
