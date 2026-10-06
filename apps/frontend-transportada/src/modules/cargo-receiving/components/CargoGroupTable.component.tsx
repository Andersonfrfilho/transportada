/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

import { useCargoGroupTitle } from '../hooks/useCargoGroupTitle.hook'
import type { CargoArrivalGroup } from '../shared/cargoArrival.types'
import styles from '../styles/cargoReceiving.module.css'
import tableStyles from '../styles/cargoTable.module.css'
import detailStyles from '../styles/cargoDetail.module.css'
import { CargoGroupRow } from './CargoGroupRow.component'

type CargoGroupTableProps = Readonly<{
  canSelect: boolean
  group: CargoArrivalGroup
  onToggleDocument: (documentId: string) => void
  onToggleGroup: (group: CargoArrivalGroup) => void
  selected: ReadonlySet<string>
}>

/** Um grupo rota × cidade com as notas dele e a contagem por estado; a seleção só existe com `canSelect`. */
export function CargoGroupTable({
  canSelect,
  group,
  onToggleDocument,
  onToggleGroup,
  selected,
}: CargoGroupTableProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const titleOf = useCargoGroupTitle()
  const title = titleOf(group)
  const selectedCount = group.documents.filter((document) =>
    selected.has(document.nfeDocumentId),
  ).length

  return (
    <section
      aria-label={t('detail.groupRegion', { title })}
      className={detailStyles.groupSection}
      role="region"
    >
      <div className={detailStyles.groupHeader}>
        <h3>{title}</h3>
        <div className={detailStyles.groupSummary}>
          {canSelect ? (
            <Checkbox
              ariaLabel={t('detail.selectGroup', { title })}
              checked={selectedCount === group.documents.length}
              indeterminate={selectedCount > 0}
              onChange={() => onToggleGroup(group)}
            />
          ) : null}
          <span className={styles.resultCount}>
            {t('group.counts', { done: group.counts.separated, total: group.counts.total })}
          </span>
        </div>
      </div>
      <p className={styles.resultCount}>
        {t('group.stateCounts', {
          expected: group.counts.expected,
          received: group.counts.received,
          separated: group.counts.separated,
        })}
      </p>
      <div className={tableStyles.tableScroll}>
        <table className={cn(tableStyles.table, tableStyles.stacked, detailStyles.groupTable)}>
          <thead>
            <tr>
              {canSelect ? <th className={detailStyles.colSelect} scope="col" /> : null}
              <th className={detailStyles.colNumber} scope="col">
                {t('detail.value')}
              </th>
              <th scope="col">{t('detail.recipient')}</th>
              <th className={detailStyles.colState} scope="col">
                {t('detail.state')}
              </th>
              <th className={detailStyles.colReturn} scope="col">
                {t('occurrence.column')}
              </th>
            </tr>
          </thead>
          <tbody>
            {group.documents.map((document) => (
              <CargoGroupRow
                canSelect={canSelect}
                document={document}
                isSelected={selected.has(document.nfeDocumentId)}
                key={document.nfeDocumentId}
                onToggle={onToggleDocument}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
