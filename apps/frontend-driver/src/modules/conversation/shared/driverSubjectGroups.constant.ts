/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectGroup } from '@adatechnology/conversations-ui/participant'
import { createElement } from 'react'

import { Icon } from '@/components/ui/icon'

import { DRIVER_CONVERSATION_SUBJECT_TYPE } from './driverConversation.constant'

/** A ordem do array é a ordem das seções; o ícone do grupo vale para a conversa sem `iconName` próprio. */
export function buildDriverSubjectGroups(
  labels: Readonly<{ document: string; occurrence: string; trip: string }>,
): readonly ParticipantSubjectGroup[] {
  return [
    {
      icon: createElement(Icon, { name: 'message' }),
      label: labels.occurrence,
      subjectType: DRIVER_CONVERSATION_SUBJECT_TYPE,
    },
    {
      icon: createElement(Icon, { name: 'invoice' }),
      label: labels.document,
      subjectType: 'document',
    },
    { icon: createElement(Icon, { name: 'truck' }), label: labels.trip, subjectType: 'trip' },
  ]
}
