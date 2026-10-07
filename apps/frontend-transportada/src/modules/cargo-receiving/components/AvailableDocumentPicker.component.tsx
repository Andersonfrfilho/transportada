/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { AvailableDocumentPickerController } from '../hooks/useAvailableDocumentPicker.hook'
import type { CargoFormIssue } from '../shared/cargoArrivalForm.validation'
import { CARGO_ARRIVAL_LIMITS } from '../shared/cargoReceiving.constant'
import styles from '../styles/cargoReceiving.module.css'
import tableStyles from '../styles/cargoTable.module.css'
import registrationStyles from '../styles/cargoRegistration.module.css'

type AvailableDocumentPickerProps = Readonly<{
  contractorId: string
  issue: CargoFormIssue | undefined
  picker: AvailableDocumentPickerController
}>

function SelectionSummary({
  issue,
  picker,
}: Readonly<{
  issue: CargoFormIssue | undefined
  picker: AvailableDocumentPickerController
}>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const max = CARGO_ARRIVAL_LIMITS.documentsPerRequest
  return (
    <div className={styles.fieldGroup}>
      <p className={styles.counter}>
        {t('available.counter', { count: picker.selection.size, max })}
      </p>
      {picker.isLimited ? (
        <p className={styles.error}>{t('available.limitReached', { max })}</p>
      ) : null}
      {issue === undefined ? null : (
        <p className={styles.error} role="alert">
          {t(`issues.${issue.code}`, { max: issue.max })}
        </p>
      )}
    </div>
  )
}

function DocumentRows({
  picker,
}: Readonly<{ picker: AvailableDocumentPickerController }>): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  return (
    <div
      aria-label={t('available.region')}
      className={tableStyles.tableScroll}
      role="region"
      tabIndex={0}
    >
      <table className={cn(tableStyles.table, tableStyles.stacked)}>
        <thead>
          <tr>
            <th scope="col">
              <Checkbox
                ariaLabel={t('available.selectAll')}
                checked={picker.selectAllState === 'all'}
                indeterminate={picker.selectAllState === 'some'}
                onChange={picker.toggleAll}
              />
            </th>
            <th scope="col">{t('available.number')}</th>
            <th scope="col">{t('available.recipient')}</th>
            <th scope="col">{t('available.city')}</th>
            <th scope="col">{t('available.value')}</th>
          </tr>
        </thead>
        <tbody>
          {picker.listed.map((document) => (
            <tr data-document-id={document.id} key={document.id}>
              <td>
                <Checkbox
                  ariaLabel={t('available.selectOne', { number: document.number })}
                  checked={picker.selection.has(document.id)}
                  onChange={() => picker.toggleDocument(document)}
                />
              </td>
              <td className={tableStyles.mono} data-label={t('available.number')}>
                {document.number}
              </td>
              <td data-label={t('available.recipient')}>
                {document.recipientName ?? t('document.unknownRecipient')}
              </td>
              <td data-label={t('available.city')}>{document.cityName ?? '—'}</td>
              <td data-label={t('available.value')}>{formatAmount(document.totalValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** As notas livres do contratante: busca, seleção com contador e limite, e mais páginas por cursor. */
export function AvailableDocumentPicker({
  contractorId,
  issue,
  picker,
}: AvailableDocumentPickerProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <section className={registrationStyles.picker}>
      <h2 className={registrationStyles.sectionTitle}>{t('available.title')}</h2>
      {contractorId === '' ? (
        <p className={styles.hint}>{t('available.pickContractor')}</p>
      ) : picker.isLoading ? (
        <SkeletonGroup label={t('available.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : picker.errorCode !== undefined ? (
        <p className={styles.error} role="alert">
          {t('available.error', { code: picker.errorCode })}
        </p>
      ) : picker.totalLoaded === 0 ? (
        <p className={styles.hint}>{t('available.empty')}</p>
      ) : (
        <>
          <div className={registrationStyles.pickerHead}>
            <label className={styles.field}>
              {t('available.search')}
              <input
                onChange={(event) => picker.setQuery(event.target.value)}
                placeholder={t('available.searchPlaceholder')}
                type="search"
                value={picker.query}
              />
            </label>
            <SelectionSummary issue={issue} picker={picker} />
          </div>
          {picker.listed.length === 0 ? (
            <p className={styles.hint}>{t('available.emptyFiltered')}</p>
          ) : (
            <DocumentRows picker={picker} />
          )}
          {picker.hasNextPage ? (
            <Button
              disabled={picker.isLoadingMore}
              onClick={picker.loadMore}
              type="button"
              variant="ghost"
            >
              <Icon name="page-next" />
              {t('available.loadMore')}
            </Button>
          ) : null}
        </>
      )}
    </section>
  )
}
