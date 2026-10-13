/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationSummary } from '@adatechnology/conversations-ui/participant'
import { createElement, type ReactNode } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'

import { CONVERSATION_SUBJECT_ICON_NAMES } from './driverConversation.constant'

function isSubjectIconName(name: string): name is IconName {
  return CONVERSATION_SUBJECT_ICON_NAMES.some((candidate) => candidate === name)
}

/** Ícone do assunto pelo catálogo da spec 255; nome fora dele ou ausente devolve `null` e o pacote usa o do grupo. */
export function renderDriverSubjectIcon(conversation: ParticipantConversationSummary): ReactNode {
  const { iconName } = conversation
  if (iconName === undefined || !isSubjectIconName(iconName)) return null
  return createElement(Icon, { name: iconName })
}
