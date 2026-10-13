/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationSummary } from '@adatechnology/conversations-ui/participant'
import { describe, expect, it } from 'bun:test'
import { isValidElement } from 'react'

import { Icon } from '../../src/components/ui/icon'
import { CONVERSATION_SUBJECT_ICON_NAMES } from '../../src/modules/conversation/shared/driverConversation.constant'
import { renderDriverSubjectIcon } from '../../src/modules/conversation/shared/driverSubjectIcon.service'

function summary(iconName?: string): ParticipantConversationSummary {
  return {
    awaitingParticipant: false,
    lastMessageAt: null,
    status: 'open',
    subjectId: 'subject-1',
    subjectLabel: 'Avaria',
    subjectType: 'occurrence',
    unreadCount: 0,
    ...(iconName === undefined ? {} : { iconName }),
  }
}

describe('renderDriverSubjectIcon (spec 263 T1b.10)', () => {
  it('todo nome do catálogo da spec 255 vira o <Icon> do app', () => {
    for (const name of CONVERSATION_SUBJECT_ICON_NAMES) {
      const node = renderDriverSubjectIcon(summary(name))
      expect(isValidElement(node)).toBe(true)
      expect(node).toMatchObject({ props: { name }, type: Icon })
    }
  })

  it('ausente ou fora do catálogo devolve null, e o pacote usa o ícone do grupo', () => {
    expect(renderDriverSubjectIcon(summary())).toBeNull()
    expect(renderDriverSubjectIcon(summary('rocket'))).toBeNull()
    expect(renderDriverSubjectIcon(summary('trash'))).toBeNull()
    expect(renderDriverSubjectIcon(summary(''))).toBeNull()
  })
})
