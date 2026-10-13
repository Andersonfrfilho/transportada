/* Copyright (c) 2026 Ada Technology. MIT License. */
import { OpenSubjectConversationButton } from './OpenSubjectConversationButton.component'
import { useIsOpenSubjectConversationEnabled } from './OpenSubjectConversationProvider.component'

type DocumentConversationSlotProps = Readonly<{
  contextLabel: string
  documentId: string
}>

/** O encaixe do botão na nota: não renderiza nada fora da provider ligada, para o cartão antigo ficar idêntico. */
export function DocumentConversationSlot({
  contextLabel,
  documentId,
}: DocumentConversationSlotProps) {
  const isEnabled = useIsOpenSubjectConversationEnabled()
  if (!isEnabled) return null
  return (
    <OpenSubjectConversationButton
      contextLabel={contextLabel}
      subjectId={documentId}
      subjectType="document"
    />
  )
}
