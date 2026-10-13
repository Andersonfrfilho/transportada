/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type SubjectThreadActionsProps = Readonly<{
  canClose: boolean
  canOpen: boolean
  isPending: boolean
  onClose: () => void
  onOpen: () => void
}>

/** Encerrar e reabrir entram no slot do cabeçalho do fio: o SDK não conhece as ações do painel. */
export function SubjectThreadActions({
  canClose,
  canOpen,
  isPending,
  onClose,
  onOpen,
}: SubjectThreadActionsProps) {
  const { t } = useTranslation('subjectConversation')
  if (canClose) {
    return (
      <Button
        aria-label={t('panel.close')}
        disabled={isPending}
        onClick={onClose}
        size="sm"
        type="button"
        variant="secondary"
      >
        {isPending ? t('panel.closing') : t('panel.closeShort')}
      </Button>
    )
  }
  if (!canOpen) return null
  return (
    <Button
      aria-label={t('panel.reopen')}
      disabled={isPending}
      onClick={onOpen}
      size="sm"
      type="button"
      variant="secondary"
    >
      {isPending ? t('panel.reopening') : t('panel.reopenShort')}
    </Button>
  )
}
