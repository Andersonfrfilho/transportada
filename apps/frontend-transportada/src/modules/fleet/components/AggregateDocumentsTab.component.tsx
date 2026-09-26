/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'

import { AggregateRejectionDialog } from './AggregateRejectionDialog.component'
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

type SortColumn = 'status' | 'type'
type SortState = Readonly<{ column: SortColumn; direction: 'asc' | 'desc' }> | null
const SORT_INDICATOR = { ascending: '▲', descending: '▼', none: '' } as const

/** Terceiro clique no cabeçalho volta à ordem natural — sem ele não há como desfazer a ordenação. */
function nextSort(current: SortState, column: SortColumn): SortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function sortDocuments(
  documents: readonly AggregateDocumentForReview[],
  sort: SortState,
): readonly AggregateDocumentForReview[] {
  if (sort === null) return documents
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...documents].sort(
    (left, right) => left[sort.column].localeCompare(right[sort.column]) * direction,
  )
}

type RejectDialogState = Readonly<{ documentId: string }> | null

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
  const [taxIdFilter, setTaxIdFilter] = useState('')
  const [sort, setSort] = useState<SortState>(null)

  if (loading) {
    return (
      <FleetTableSkeleton columnCount={DOCUMENTS_COLUMN_COUNT} label={t('documents.loading')} />
    )
  }
  if (documents.length === 0) return <p className={styles.kicker}>{t('documents.empty')}</p>

  const filtered = documents.filter((document) =>
    document.taxId.toLowerCase().includes(taxIdFilter.trim().toLowerCase()),
  )
  const visible = sortDocuments(filtered, sort)

  function sortState(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (sort === null || sort.column !== column) return 'none'
    return sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortLabel(column: SortColumn): string {
    if (sort === null || sort.column !== column) return t('sort.none')
    return sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  function renderSortableHeader(column: SortColumn, label: string) {
    return (
      <th aria-sort={sortState(column)} key={column} scope="col">
        <button
          className={styles.sortButton}
          type="button"
          onClick={() => setSort((current) => nextSort(current, column))}
        >
          {label}
          <span aria-hidden="true" className={styles.sortIndicator}>
            {SORT_INDICATOR[sortState(column)]}
          </span>
          <span className={styles.srOnly}>{sortLabel(column)}</span>
        </button>
      </th>
    )
  }

  return (
    <div className={styles.tableScroll}>
      <div className={styles.filterBar}>
        <label>
          <span>{t('documents.filterTaxId')}</span>
          <input
            type="search"
            value={taxIdFilter}
            onChange={(event) => setTaxIdFilter(event.target.value)}
          />
        </label>
      </div>
      <p className={styles.hint}>
        {t('documents.shownOfTotal', { shown: visible.length, total: documents.length })}
      </p>
      <table className={styles.fleetTable}>
        <thead>
          <tr>
            {renderSortableHeader('type', t('documents.columns.type'))}
            <th scope="col">{t('documents.columns.taxId')}</th>
            {renderSortableHeader('status', t('documents.columns.status'))}
            <th scope="col">{t('documents.columns.check')}</th>
            <th scope="col">{t('documents.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((document) => (
            <Fragment key={document.id}>
              <tr>
                <td>
                  <Icon aria-hidden name={TYPE_ICON[document.type]} size="sm" />{' '}
                  {t(`documents.type.${document.type}`)}
                </td>
                <td>{document.taxId}</td>
                <td>
                  <Badge variant="info">{t(`documents.status.${document.status}`)}</Badge>
                </td>
                <td>
                  <DocumentCheck document={document} />
                </td>
                <td className={styles.rowActions}>
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => onOpenFile(document.id)}
                  >
                    <Icon name="eye" />
                    {t('documents.openButton')}
                  </Button>
                  {document.status === 'pending' ? (
                    <>
                      <Button
                        disabled={isReviewing}
                        size="sm"
                        type="button"
                        onClick={() =>
                          onReview({ decision: 'approved', id: document.id, rejectionReason: '' })
                        }
                      >
                        <Icon name="check" />
                        {t('documents.approveButton')}
                      </Button>
                      <Button
                        disabled={isReviewing}
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => setRejectDialog({ documentId: document.id })}
                      >
                        <Icon name="close" />
                        {t('documents.rejectButton')}
                      </Button>
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
        <AggregateRejectionDialog
          cancelLabel={t('documents.cancelButton')}
          confirmLabel={t('documents.confirmRejectButton')}
          isSubmitting={isReviewing}
          reasonLabel={t('documents.rejectReasonLabel')}
          title={t('documents.rejectDialogTitle')}
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
    return <Badge variant="info">{t('documents.check.matches')}</Badge>
  }

  return (
    <Badge variant="warning">
      <Icon aria-hidden name="alert" size="sm" />
      {t('documents.check.divergent', { count: document.divergences.length })}
    </Badge>
  )
}
