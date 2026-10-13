/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useOpenSubjectConversation } from '../hooks/useOpenSubjectConversation.hook'
import type { OpenableSubject } from '../shared/openSubjectConversation.service'
import { OpenSubjectConversationView } from './OpenSubjectConversationView.component'

type OpenSubjectConversationButtonProps = OpenableSubject &
  Readonly<{
    contextLabel: string
  }>

export function OpenSubjectConversationButton({
  contextLabel,
  subjectId,
  subjectType,
}: OpenSubjectConversationButtonProps) {
  const { action, errorKey, handleOpen } = useOpenSubjectConversation({ subjectId, subjectType })
  return (
    <OpenSubjectConversationView
      action={action}
      contextLabel={contextLabel}
      {...(errorKey === undefined ? {} : { errorKey })}
      onOpen={() => void handleOpen()}
    />
  )
}
