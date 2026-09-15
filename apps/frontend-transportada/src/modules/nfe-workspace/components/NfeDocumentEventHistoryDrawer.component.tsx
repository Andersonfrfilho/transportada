/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfeDocumentEventHistoryController } from '../hooks/useNfeDocumentEventHistory.hook'
import type { NfeDocumentEventEntry } from '../shared/nfeDocumentEventClient.service'
import {
  actorDisplayLabelKey,
  describeNfeEventActors,
  describeNfeEventOrigin,
  describeNfeEventStatus,
  describeNfeEventType,
} from '../shared/nfeDocumentEventHistory.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeDocumentEventHistoryDrawerProps = Readonly<{
  controller: NfeDocumentEventHistoryController
}>

const STATUS_TONE: Readonly<Record<string, string | undefined>> = {
  authorized: styles.badgeReady,
  cancelled: styles.badgeMuted,
  denied: styles.badgeDanger,
}

const SKELETON_ROWS = 3

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  year: 'numeric',
})

function formatDateTime(value: string | null): string {
  if (value === null) return '—'
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : dateTimeFormatter.format(moment)
}

export function NfeDocumentEventHistoryDrawer({ controller }: NfeDocumentEventHistoryDrawerProps) {
  const { t } = useTranslation('nfeWorkspace')
  const isOpen = controller.target !== null
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose: controller.close })

  if (controller.target === null) return null

  return createPortal(
    <div className={styles.eventHistoryOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfe-event-history-title"
        aria-modal="true"
        className={styles.eventHistoryDrawer}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.eventHistoryHeader}>
          <div>
            <h2 id="nfe-event-history-title">{t('documents.eventHistory.title')}</h2>
            <p className={styles.eventHistorySubtitle}>
              {t('documents.eventHistory.subtitle', {
                number: controller.target.number,
                series: controller.target.series,
              })}
            </p>
          </div>
          <button
            aria-label={t('documents.eventHistory.close')}
            className={styles.iconAction}
            onClick={controller.close}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {controller.isLoading ? (
          <SkeletonGroup
            className={styles.eventHistoryList}
            label={t('documents.eventHistory.loading')}
          >
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <div className={styles.eventHistoryItem} key={index}>
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="text" width="70%" />
              </div>
            ))}
          </SkeletonGroup>
        ) : controller.entries.length === 0 && controller.errorCode !== null ? (
          <div className={styles.cardError} role="alert">
            <p>{t('documents.eventHistory.error')}</p>
            <button className={styles.ghostAction} onClick={controller.retry} type="button">
              {t('documents.eventHistory.retry')}
            </button>
          </div>
        ) : controller.entries.length === 0 ? (
          <p className={styles.emptyState}>{t('documents.eventHistory.empty')}</p>
        ) : (
          <ol className={styles.eventHistoryList}>
            {controller.entries.map((entry) => (
              <EventHistoryItem entry={entry} key={entry.id} />
            ))}
          </ol>
        )}

        {controller.entries.length > 0 && controller.errorCode !== null ? (
          <div className={styles.eventHistoryFooter}>
            <p className={styles.cardError} role="alert">
              {t('documents.eventHistory.errorMore')}
            </p>
            <button className={styles.ghostAction} onClick={controller.fetchNextPage} type="button">
              {t('documents.eventHistory.retry')}
            </button>
          </div>
        ) : (
          controller.hasNextPage && (
            <div className={styles.eventHistoryFooter}>
              <button
                className={styles.ghostAction}
                disabled={controller.isFetchingNextPage}
                onClick={controller.fetchNextPage}
                type="button"
              >
                {controller.isFetchingNextPage
                  ? t('documents.eventHistory.loadingMore')
                  : t('documents.eventHistory.loadMore')}
              </button>
              <span aria-live="polite" className={styles.srOnly}>
                {controller.isFetchingNextPage ? t('documents.eventHistory.loadingMore') : ''}
              </span>
            </div>
          )
        )}
      </div>
    </div>,
    document.body,
  )
}

function EventHistoryItem({ entry }: Readonly<{ entry: NfeDocumentEventEntry }>) {
  const { t } = useTranslation('nfeWorkspace')
  const eventType = describeNfeEventType(entry)
  const actors = describeNfeEventActors(entry)
  const actorLabelKey = actors.actor === null ? null : actorDisplayLabelKey(actors.actor)
  const requestedByLabelKey =
    actors.requestedBy === null ? null : actorDisplayLabelKey(actors.requestedBy)

  return (
    <li className={styles.eventHistoryItem}>
      <div className={styles.eventHistoryItemHeader}>
        <strong>
          {eventType.code === undefined
            ? t(eventType.key)
            : t(eventType.key, { code: eventType.code })}
        </strong>
      </div>

      <dl className={styles.eventHistoryMeta}>
        <div>
          <dt>{t('documents.eventHistory.eventDate')}</dt>
          <dd>
            {entry.occurredAt === null ? (
              formatDateTime(null)
            ) : (
              <time className={styles.eventHistoryTime} dateTime={entry.occurredAt}>
                {formatDateTime(entry.occurredAt)}
              </time>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('documents.eventHistory.registeredDate')}</dt>
          <dd>
            <time className={styles.eventHistoryTime} dateTime={entry.registeredAt}>
              {formatDateTime(entry.registeredAt)}
            </time>
          </dd>
        </div>
        {entry.sequence !== null && (
          <div>
            <dt>{t('documents.eventHistory.sequence')}</dt>
            <dd>{entry.sequence}</dd>
          </div>
        )}
        {entry.protocol !== null && (
          <div>
            <dt>{t('documents.eventHistory.protocol')}</dt>
            <dd>{entry.protocol}</dd>
          </div>
        )}
        {entry.statusCode !== null && (
          <div>
            <dt>{t('documents.eventHistory.statusCode')}</dt>
            <dd>{entry.statusCode}</dd>
          </div>
        )}
        <div>
          <dt>{t('documents.eventHistory.statusChangeLabel')}</dt>
          <dd className={styles.eventHistoryStatusChange}>
            <span className={`${styles.badge} ${STATUS_TONE[entry.statusBefore ?? ''] ?? ''}`}>
              {t(describeNfeEventStatus(entry.statusBefore))}
            </span>
            <Icon name="chevron-right" />
            <span className={`${styles.badge} ${STATUS_TONE[entry.statusAfter ?? ''] ?? ''}`}>
              {t(describeNfeEventStatus(entry.statusAfter))}
            </span>
          </dd>
        </div>
        <div>
          <dt>{t('documents.eventHistory.origin.label')}</dt>
          <dd>{t(describeNfeEventOrigin(entry.origin))}</dd>
        </div>
        {actors.actor !== null && (
          <div>
            <dt>{t('documents.eventHistory.actorLabel')}</dt>
            <dd>
              {actors.actor.kind === 'named'
                ? actors.actor.name
                : actorLabelKey !== null
                  ? t(actorLabelKey)
                  : null}
            </dd>
          </div>
        )}
        {actors.requestedBy !== null && (
          <div>
            <dt>{t('documents.eventHistory.requestedByLabel')}</dt>
            <dd>
              {actors.requestedBy.kind === 'named'
                ? actors.requestedBy.name
                : requestedByLabelKey !== null
                  ? t(requestedByLabelKey)
                  : null}
            </dd>
          </div>
        )}
      </dl>

      {entry.correctionText !== null && (
        <p className={styles.eventHistoryCorrection}>
          <span>{t('documents.eventHistory.correctionText')}</span>
          {entry.correctionText}
        </p>
      )}
    </li>
  )
}
