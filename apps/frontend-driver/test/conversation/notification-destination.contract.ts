import { describe, expect, it } from 'bun:test'

import { resolveNotificationDestination } from '../../src/modules/notification/shared/notificationDestination.service'

describe('resolveNotificationDestination (spec 260 T1b.2, D6)', () => {
  it('aviso de conversa com assunto no payload abre aquela conversa', () => {
    expect(
      resolveNotificationDestination({
        payload: { subjectId: 'abc', subjectType: 'occurrence' },
        templateKey: 'trip.conversation-message',
      }),
    ).toEqual({ kind: 'conversation', subject: { subjectId: 'abc', subjectType: 'occurrence' } })
  })

  it('aviso de conversa sem assunto abre a lista', () => {
    expect(
      resolveNotificationDestination({
        payload: { occurrenceLabel: 'NF 1' },
        templateKey: 'trip.conversation-message',
      }),
    ).toEqual({ kind: 'conversations' })
  })

  it('payload com assunto de tipo errado cai na lista', () => {
    expect(
      resolveNotificationDestination({
        payload: { subjectId: 1, subjectType: 'occurrence' },
        templateKey: 'trip.conversation-message',
      }),
    ).toEqual({ kind: 'conversations' })
  })

  it('outros avisos ficam onde estão', () => {
    expect(resolveNotificationDestination({ payload: {}, templateKey: 'trip.dispatched' })).toEqual(
      { kind: 'stay' },
    )
  })
})
