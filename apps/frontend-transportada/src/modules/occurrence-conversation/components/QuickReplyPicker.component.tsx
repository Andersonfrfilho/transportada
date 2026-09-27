/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import { useComposerQuickRepliesQuery } from '../queries/quickReplies.query'
import type { QuickReplyAudience } from '../shared/occurrenceConversation.types'

type QuickReplyPickerProps = Readonly<{
  audience: QuickReplyAudience
  disabled?: boolean
  onPick: (text: string) => void
}>

/**
 * Spec 183 T701 (RF12): as respostas rápidas ativas do público da aba. Escolher só **insere** o texto
 * no rascunho — o operador ainda edita antes de mandar (D4). Sem resposta cadastrada, não aparece.
 */
export function QuickReplyPicker({ audience, disabled = false, onPick }: QuickReplyPickerProps) {
  const { t } = useTranslation('occurrenceConversation')
  const query = useComposerQuickRepliesQuery(audience)
  const replies = query.data ?? []
  if (replies.length === 0) return null

  return (
    <Select
      ariaLabel={t('quickReplies.pick')}
      compact
      disabled={disabled}
      onChange={(id) => {
        const reply = replies.find((candidate) => candidate.id === id)
        if (reply !== undefined) onPick(reply.text)
      }}
      options={replies.map((reply) => ({ label: reply.text, value: reply.id }))}
      placeholder={t('quickReplies.pick')}
      value=""
    />
  )
}
