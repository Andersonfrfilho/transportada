/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '@/components/ui/icon'

import { FleetTableSkeleton } from './FleetTableSkeleton.component'
import type {
  AggregateDocumentForReview,
  AggregateDocumentType,
} from '../shared/aggregateDocumentClient.service'
import styles from '../styles/fleet.module.css'

const DOCUMENTS_COLUMN_COUNT = 5

/** O mesmo ícone significa o mesmo documento em todo o produto (`web.md` §9). */
const TYPE_ICON: Readonly<Record<AggregateDocumentType, IconName>> = {
  cnh: 'document',
  crlv: 'workspace-fleet',
}

type RejectDialogState = Readonly<{ documentId: string; reason: string }> | null

type AggregateDocumentsTabProps = Readonly<{
  documents: readonly AggregateDocumentForReview[]
  isReviewing: boolean
  loading: boolean
  onOpenFile: (id: string) => void
  onReview: (
    input: Readonly<{ decision: 'approved' | 'rejected'; id: string; rejectionReason: string }>,
  ) => void
}>

export function AggregateDocumentsTab({
  documents,
  isReviewing,
  loading,
  onOpenFile,
  onReview,
}: AggregateDocumentsTabProps): ReactNode {
  const { t } = useTranslation('fleet')
  const [rejectDialog, setRejectDialog] = useState<RejectDialogState>(null)

  if (loading) {
    return (
      <FleetTableSkeleton columnCount={DOCUMENTS_COLUMN_COUNT} label={t('documents.loading')} />
    )
  }
  if (documents.length === 0) return <p className={styles.kicker}>{t('documents.empty')}</p>

  return (
    <div className={styles.tableScroll}>
      <table className={styles.fleetTable}>
        <thead>
          <tr>
            <th>{t('documents.columns.type')}</th>
            <th>{t('documents.columns.taxId')}</th>
            <th>{t('documents.columns.status')}</th>
            <th>{t('documents.columns.check')}</th>
            <th>{t('documents.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((document) => (
            <Fragment key={document.id}>
              <tr>
                <td>
                  <Icon aria-hidden name={TYPE_ICON[document.type]} size="sm" />{' '}
                  {t(`documents.type.${document.type}`)}
                </td>
                <td>{document.taxId}</td>
                <td>
                  <span className={styles.applicationBadge} data-variant="info">
                    {t(`documents.status.${document.status}`)}
                  </span>
                </td>
                <td>
                  <DocumentCheck document={document} />
                </td>
                <td className={styles.rowActions}>
                  <button type="button" onClick={() => onOpenFile(document.id)}>
                    <Icon aria-hidden name="eye" size="sm" /> {t('documents.openButton')}
                  </button>
                  {document.status === 'pending' ? (
                    <>
                      <button
                        disabled={isReviewing}
                        type="button"
                        onClick={() =>
                          onReview({ decision: 'approved', id: document.id, rejectionReason: '' })
                        }
                      >
                        <Icon aria-hidden name="check" size="sm" /> {t('documents.approveButton')}
                      </button>
                      <button
                        disabled={isReviewing}
                        type="button"
                        onClick={() => setRejectDialog({ documentId: document.id, reason: '' })}
                      >
                        <Icon aria-hidden name="close" size="sm" /> {t('documents.rejectButton')}
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
              {document.divergences.length === 0 ? null : (
                <tr>
                  <td
                    className={styles.applicationDeclaredDataCell}
                    colSpan={DOCUMENTS_COLUMN_COUNT}
                  >
                    <dl>
                      {document.divergences.map((divergence) => (
                        <dd key={divergence.field}>
                          {t(`documents.fields.${divergence.field}`, {
                            defaultValue: divergence.field,
                          })}
                          : {t('documents.divergence.document')}{' '}
                          <strong>{divergence.extracted}</strong>,{' '}
                          {t('documents.divergence.declared')}{' '}
                          <strong>{divergence.declared}</strong>
                        </dd>
                      ))}
                    </dl>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {rejectDialog === null ? null : (
        <RejectDialog
          state={rejectDialog}
          onCancel={() => setRejectDialog(null)}
          onConfirm={(reason) => {
            onReview({
              decision: 'rejected',
              id: rejectDialog.documentId,
              rejectionReason: reason,
            })
            setRejectDialog(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * "Nada divergiu" e "não deu para conferir" são coisas diferentes para quem aprova — o segundo é o
 * documento que o OCR não leu (PDF, serviço desligado, foto ilegível), e dizer "confere" ali seria
 * mentira com cara de garantia.
 */
function DocumentCheck({
  document,
}: Readonly<{ document: AggregateDocumentForReview }>): ReactNode {
  const { t } = useTranslation('fleet')

  if (!document.hasExtraction) return <span>{t('documents.check.unverified')}</span>
  if (document.divergences.length === 0) {
    return (
      <span className={styles.applicationBadge} data-variant="info">
        {t('documents.check.matches')}
      </span>
    )
  }

  return (
    <span className={styles.applicationBadge} data-variant="warning">
      <Icon aria-hidden name="alert" size="sm" />{' '}
      {t('documents.check.divergent', { count: document.divergences.length })}
    </span>
  )
}

type RejectDialogProps = Readonly<{
  onCancel: () => void
  onConfirm: (reason: string) => void
  state: NonNullable<RejectDialogState>
}>

function RejectDialog({ onCancel, onConfirm, state }: RejectDialogProps): ReactNode {
  const { t } = useTranslation('fleet')
  const [reason, setReason] = useState(state.reason)
  const canConfirm = reason.trim().length > 0

  return (
    <div
      className={styles.rejectDialog}
      role="dialog"
      aria-label={t('documents.rejectDialogTitle')}
    >
      <label>
        <span>{t('documents.rejectReasonLabel')}</span>
        <textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <div className={styles.rowActions}>
        <button disabled={!canConfirm} type="button" onClick={() => onConfirm(reason.trim())}>
          {t('documents.confirmRejectButton')}
        </button>
        <button type="button" onClick={onCancel}>
          {t('documents.cancelButton')}
        </button>
      </div>
    </div>
  )
}
