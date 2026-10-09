/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { OpenAction, OpenErrorKey } from '../shared/openSubjectConversation.service'
import styles from '../styles/openSubjectConversation.module.css'

type OpenSubjectConversationViewProps = Readonly<{
  action: OpenAction
  contextLabel: string
  errorKey?: OpenErrorKey
  onOpen: () => void
}>

const LABEL_KEY = {
  offline: 'open.label',
  open: 'open.label',
  opening: 'open.opening',
  view: 'open.view',
} as const

export function OpenSubjectConversationView({
  action,
  contextLabel,
  errorKey,
  onOpen,
}: OpenSubjectConversationViewProps) {
  const { t } = useTranslation('conversation')
  const hintId = useId()
  if (action.kind === 'hidden') return null
  const isOffline = action.kind === 'offline'
  const isOpening = action.kind === 'opening'
  const visibleLabel = t(LABEL_KEY[action.kind])

  return (
    <div className={styles.openSubject}>
      <button
        aria-busy={isOpening}
        aria-describedby={isOffline ? hintId : undefined}
        aria-label={t('open.ariaLabel', { context: contextLabel, label: visibleLabel })}
        className={styles.openSubjectButton}
        disabled={isOffline || isOpening}
        onClick={onOpen}
        type="button"
      >
        <Icon aria-hidden="true" name="message" size="sm" />
        <span>{visibleLabel}</span>
        {action.unreadCount > 0 ? (
          <span className={styles.openSubjectBadge}>
            {t('open.unread', { count: action.unreadCount })}
          </span>
        ) : null}
      </button>
      {isOffline ? (
        <p className={styles.openSubjectHint} id={hintId}>
          {t('open.offlineHint')}
        </p>
      ) : null}
      <p
        aria-live="polite"
        className={styles.openSubjectError}
        role={errorKey === undefined ? undefined : 'alert'}
      >
        {errorKey === undefined ? null : t(`open.error.${errorKey}`)}
      </p>
    </div>
  )
}
