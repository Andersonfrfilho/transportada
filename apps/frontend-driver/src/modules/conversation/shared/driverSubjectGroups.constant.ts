/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectGroup } from '@adatechnology/conversations-ui/participant'
import { createElement } from 'react'

import { Icon } from '@/components/ui/icon'

import { DRIVER_CONVERSATION_SUBJECT_TYPE } from './driverConversation.constant'

/** A ordem do array é a ordem das seções; assunto novo (nota, viagem) entra aqui. */
export function buildDriverSubjectGroups(
  labels: Readonly<{ occurrence: string }>,
): readonly ParticipantSubjectGroup[] {
  return [
    {
      icon: createElement(Icon, { name: 'message' }),
      label: labels.occurrence,
      subjectType: DRIVER_CONVERSATION_SUBJECT_TYPE,
    },
  ]
}
