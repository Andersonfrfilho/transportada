import { describe, expect, it } from 'bun:test'

import { resolveNotificationDestination } from '../../src/modules/notification/shared/notificationDestination.service'
import {
  LEGACY_CONVERSATION_MESSAGE_TEMPLATE_KEY,
  OCCURRENCE_RESOLVED_TEMPLATE_KEY,
  SUBJECT_CONVERSATION_MESSAGE_TEMPLATE_KEY,
} from '../../src/modules/notification/shared/notificationTemplate.constant'

const CONVERSATION_KEYS = [
  LEGACY_CONVERSATION_MESSAGE_TEMPLATE_KEY,
  SUBJECT_CONVERSATION_MESSAGE_TEMPLATE_KEY,
] as const

describe('resolveNotificationDestination (spec 263 T1b.2, D6; T2.0 ADR-0101 §9/§10)', () => {
  for (const templateKey of CONVERSATION_KEYS) {
    describe(`chave ${templateKey}`, () => {
      it('aviso com assunto válido no payload abre aquela conversa', () => {
        expect(
          resolveNotificationDestination({
            payload: { subjectId: 'abc', subjectType: 'occurrence' },
            templateKey,
          }),
        ).toEqual({
          kind: 'conversation',
          subject: { subjectId: 'abc', subjectType: 'occurrence' },
        })
      })

      it('aviso sem assunto no payload abre a lista', () => {
        expect(
          resolveNotificationDestination({ payload: { occurrenceLabel: 'NF 1' }, templateKey }),
        ).toEqual({ kind: 'conversations' })
      })

      it('payload com assunto de tipo errado cai na lista', () => {
        expect(
          resolveNotificationDestination({
            payload: { subjectId: 1, subjectType: 'occurrence' },
            templateKey,
          }),
        ).toEqual({ kind: 'conversations' })
      })

      it.each([
        ['path traversal', '../x'],
        ['espaço', 'trip occurrence'],
        ['maiúscula', 'Occurrence'],
        ['começa com dígito', '1occurrence'],
      ])('subjectType inválido (%s) cai na lista', (_label, subjectType) => {
        expect(
          resolveNotificationDestination({
            payload: { subjectId: 'abc', subjectType },
            templateKey,
          }),
        ).toEqual({ kind: 'conversations' })
      })

      it('subjectId vazio ou acima de 128 caracteres cai na lista', () => {
        expect(
          resolveNotificationDestination({
            payload: { subjectId: '', subjectType: 'occurrence' },
            templateKey,
          }),
        ).toEqual({ kind: 'conversations' })
        expect(
          resolveNotificationDestination({
            payload: { subjectId: 'a'.repeat(129), subjectType: 'occurrence' },
            templateKey,
          }),
        ).toEqual({ kind: 'conversations' })
      })
    })
  }

  it('outros avisos ficam onde estão', () => {
    expect(resolveNotificationDestination({ payload: {}, templateKey: 'trip.dispatched' })).toEqual(
      { kind: 'stay' },
    )
  })

  it('chave de conversa desconhecida fica onde está', () => {
    expect(
      resolveNotificationDestination({
        payload: { subjectId: 'abc', subjectType: 'occurrence' },
        templateKey: 'trip.conversation-message-v9',
      }),
    ).toEqual({ kind: 'stay' })
  })

  describe(`chave ${OCCURRENCE_RESOLVED_TEMPLATE_KEY} (spec 266 T4.9)`, () => {
    const templateKey = OCCURRENCE_RESOLVED_TEMPLATE_KEY

    it.each(['document', 'stop'] as const)(
      'abre o detalhe da ocorrência de %s',
      (occurrenceKind) => {
        expect(
          resolveNotificationDestination({
            payload: {
              occurrenceKind,
              subjectId: 'occ-1',
              subjectType: 'occurrence',
              typeName: 'Recusa',
            },
            templateKey,
          }),
        ).toEqual({ kind: 'occurrence', occurrenceId: 'occ-1', occurrenceKind })
      },
    )

    it.each([
      ['sem o tipo da ocorrência', { subjectId: 'occ-1', subjectType: 'occurrence' }],
      [
        'tipo de ocorrência desconhecido',
        { occurrenceKind: 'trip', subjectId: 'occ-1', subjectType: 'occurrence' },
      ],
      [
        'assunto que não é ocorrência',
        { occurrenceKind: 'stop', subjectId: 'occ-1', subjectType: 'document' },
      ],
      ['id vazio', { occurrenceKind: 'stop', subjectId: '', subjectType: 'occurrence' }],
      [
        'id acima de 128 caracteres',
        { occurrenceKind: 'stop', subjectId: 'a'.repeat(129), subjectType: 'occurrence' },
      ],
      ['id que não é texto', { occurrenceKind: 'stop', subjectId: 7, subjectType: 'occurrence' }],
    ])('payload %s fica onde está', (_label, payload) => {
      expect(resolveNotificationDestination({ payload, templateKey })).toEqual({ kind: 'stay' })
    })
  })
})
