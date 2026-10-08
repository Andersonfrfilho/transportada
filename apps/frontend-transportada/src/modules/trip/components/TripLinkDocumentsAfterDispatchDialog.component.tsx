/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useTripDocumentLinkDialog } from '../hooks/useTripDocumentLinkDialog.hook'
import { loadAvailableTripDocuments } from '../shared/availableTripDocuments.service'
import { AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY } from '../shared/trip.constant'
import { DOCUMENT_LINK_REASON_MAX_LENGTH } from '../shared/tripDocumentLink.service'
import type { LinkDocumentsAfterDispatchResult } from '../shared/tripDocumentLink.types'
import styles from '../styles/trip.module.css'
import { TripDocumentLinkOutcome } from './TripDocumentLinkOutcome.component'
import { TripDocumentSearch } from './TripDocumentSearch.component'

type TripLinkDocumentsAfterDispatchDialogProps = Readonly<{
  isOpen: boolean
  onClose: () => void
  onSubmit: (
    input: Readonly<{ nfeDocumentIds: readonly string[]; reason: string }>,
  ) => Promise<LinkDocumentsAfterDispatchResult>
  tripId: string
}>

/**
 * Spec 257 T2.2: a viagem que já saiu recebe notas soltas (a van quebrou e outra assume a carga).
 * Servido só quando `allowed-actions` traz `linkDocumentsAfterDispatch` e a pessoa tem
 * `trip.report-on-behalf`. O roteiro, o pedágio e o ETA não mudam — o diálogo diz isso.
 */
export function TripLinkDocumentsAfterDispatchDialog({
  isOpen,
  onClose,
  onSubmit,
  tripId,
}: TripLinkDocumentsAfterDispatchDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const dialog = useTripDocumentLinkDialog({ isOpen, onSubmit, tripId })
  const documentsQuery = useQuery({
    enabled: isOpen,
    queryFn: loadAvailableTripDocuments,
    queryKey: AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY,
  })

  if (!isOpen) return null

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-link-documents-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-link-documents-dialog-title">{t('linkDocumentsDialog.title')}</h2>
            <p className={styles.mdfeGateSubtitle}>{t('linkDocumentsDialog.subtitle')}</p>
          </div>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {dialog.outcome === undefined ? (
          <div className={styles.fieldGrid}>
            <TripDocumentSearch
              documents={documentsQuery.data ?? []}
              isLoading={documentsQuery.isLoading}
              onSelectionChange={(documents) =>
                dialog.setNfeDocumentIds(documents.map((document) => document.id))
              }
              selectedIds={dialog.nfeDocumentIds}
            />

            <label>
              {t('linkDocumentsDialog.reason')}
              <textarea
                autoComplete="off"
                maxLength={DOCUMENT_LINK_REASON_MAX_LENGTH}
                onChange={(event) => dialog.setReason(event.target.value)}
                value={dialog.reason}
              />
            </label>

            <p className={styles.hint}>{t('linkDocumentsDialog.routeUntouched')}</p>

            {dialog.blocker !== undefined && dialog.nfeDocumentIds.length > 0 ? (
              <p className={styles.hint}>{t(`linkDocumentsDialog.blocker.${dialog.blocker}`)}</p>
            ) : null}
          </div>
        ) : (
          <TripDocumentLinkOutcome outcome={dialog.outcome} />
        )}

        {dialog.errorKey === undefined ? null : (
          <p className={styles.alert} role="alert">
            {t(`linkDocumentsDialog.error.${dialog.errorKey}`)}
          </p>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          {dialog.outcome === undefined ? (
            <Button
              disabled={!dialog.canSubmit}
              onClick={() => void dialog.submit()}
              size="sm"
              type="button"
            >
              <Icon name="add" />
              {t('linkDocumentsDialog.submit', { count: dialog.nfeDocumentIds.length })}
            </Button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
