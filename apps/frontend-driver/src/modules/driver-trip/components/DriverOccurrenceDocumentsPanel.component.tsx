/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { OccurrenceShareController } from '../hooks/useOccurrenceShare.hook'
import { openDriverFileInNewTab, readOccurrenceFileUrl } from '../shared/driverFileShare.service'
import type { RouteOccurrenceKind } from '../shared/driverRouteOccurrence.types'
import {
  shareRouteOccurrenceDocuments,
  type RouteOccurrenceDocument,
} from '../shared/routeOccurrenceDocuments.service'
import styles from '../styles/routeOccurrence.module.css'

type DriverOccurrenceDocumentsPanelProps = Readonly<{
  documents: readonly RouteOccurrenceDocument[]
  /** Sem rede o link assinado não sai: os botões ficam desligados e o painel explica. */
  isDisabled: boolean
  occurrence: Readonly<{ id: string; kind: RouteOccurrenceKind; title: string }>
  shareController: OccurrenceShareController
}>

function formatFileSize(sizeBytes: number | null): string {
  if (sizeBytes === null) return ''
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}

function toFileBadge(document: RouteOccurrenceDocument): string {
  const extension = document.fileName.split('.').pop()
  return extension !== undefined && extension.length <= 4 ? extension.toUpperCase() : 'FILE'
}

/** Spec 266 RF6: ver e compartilhar cada documento, e "Compartilhar os N" quando há mais de um. */
export function DriverOccurrenceDocumentsPanel({
  documents,
  isDisabled,
  occurrence,
  shareController,
}: DriverOccurrenceDocumentsPanelProps) {
  const { t } = useTranslation('driverTrip')
  const [hasViewFailed, setHasViewFailed] = useState(false)
  const isSharing = shareController.pendingKey !== undefined

  function handleView(document: RouteOccurrenceDocument): void {
    setHasViewFailed(false)
    readOccurrenceFileUrl({ id: occurrence.id, kind: occurrence.kind, objectId: document.objectId })
      .then((url) => openDriverFileInNewTab({ url }))
      .catch(() => setHasViewFailed(true))
  }

  function handleShare(selected: readonly RouteOccurrenceDocument[], key: string): void {
    void shareController.share({
      key,
      run: () =>
        shareRouteOccurrenceDocuments({
          documents: selected,
          id: occurrence.id,
          kind: occurrence.kind,
          title: occurrence.title,
        }),
    })
  }

  return (
    <section className={styles.panel} data-panel="documents">
      <h2 className={styles.panelTitle}>
        <Icon name="paperclip" size="sm" />{' '}
        {documents.length === 0
          ? t('routeOccurrence.detail.documents.titleEmpty')
          : t('routeOccurrence.detail.documents.title', { count: documents.length })}
      </h2>
      {isDisabled ? (
        <p className={styles.panelHint} role="status">
          {t('routeOccurrence.detail.documents.offline')}
        </p>
      ) : null}
      {documents.map((document) => {
        const viewLabel = t('routeOccurrence.detail.documents.view', { name: document.fileName })
        const shareLabel = t('routeOccurrence.detail.documents.share', { name: document.fileName })
        return (
          <div
            className={styles.documentRow}
            data-document={document.objectId}
            key={document.objectId}
          >
            <span aria-hidden="true" className={styles.documentBadge}>
              {toFileBadge(document)}
            </span>
            <span className={styles.documentName}>
              {document.fileName}
              <small>
                {[
                  t(`routeOccurrence.detail.documents.origin.${document.origin}`),
                  formatFileSize(document.sizeBytes),
                ]
                  .filter((part) => part !== '')
                  .join(' · ')}
              </small>
            </span>
            <span className={styles.documentActions}>
              <button
                aria-label={viewLabel}
                className={styles.iconButton}
                disabled={isDisabled}
                title={viewLabel}
                type="button"
                onClick={() => handleView(document)}
              >
                <Icon name="eye" />
              </button>
              <button
                aria-label={shareLabel}
                className={styles.iconButton}
                disabled={isDisabled || isSharing}
                title={shareLabel}
                type="button"
                onClick={() => handleShare([document], document.objectId)}
              >
                <Icon name="share" />
              </button>
            </span>
          </div>
        )
      })}
      {documents.length > 1 ? (
        <button
          className={styles.primaryButton}
          disabled={isDisabled || isSharing}
          type="button"
          onClick={() => handleShare(documents, 'all')}
        >
          <Icon name="share" />{' '}
          {t('routeOccurrence.detail.documents.shareAll', { count: documents.length })}
        </button>
      ) : null}
      {hasViewFailed ? (
        <p className={`${styles.notice} ${styles.noticeAlert}`} role="alert">
          {t('routeOccurrence.detail.documents.viewFailed')}
        </p>
      ) : null}
    </section>
  )
}
