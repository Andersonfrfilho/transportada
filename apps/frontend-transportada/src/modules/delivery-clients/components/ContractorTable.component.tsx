/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatTaxId } from '@/modules/shared/taxId.service'

import type { ContractorTableController } from '../hooks/useContractorTable.hook'
import type { ReceivingProfileSummary } from '../queries/useReceivingProfile.query'
import type { Contractor } from '../shared/contractorDirectory.types'
import { resolveReceivingBadge, type ContractorSortColumn } from '../shared/contractorTable.service'
import styles from '../styles/contractorDirectory.module.css'

const SORT_INDICATOR = { ascending: '▲', descending: '▼', none: '' } as const
type SortState = keyof typeof SORT_INDICATOR

type ContractorTableProps = Readonly<{
  contractors: readonly Contractor[]
  onOpen: (id: string) => void
  profiles: ReadonlyMap<string, ReceivingProfileSummary>
  table: ContractorTableController
}>

const BADGE_CLASS = { disabled: styles.badgeOff, enabled: styles.badgeOn, none: undefined } as const

function ReceivingBadgeCell({
  summary,
}: Readonly<{ summary: ReceivingProfileSummary | undefined }>): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  if (summary === undefined || summary.state === 'loading') {
    return <span className={styles.badge}>{t('badge.loading')}</span>
  }
  if (summary.state === 'error') return <span className={styles.badge}>{t('badge.error')}</span>
  const badge = resolveReceivingBadge(summary.profile)
  return (
    <span className={[styles.badge, BADGE_CLASS[badge]].filter(Boolean).join(' ')}>
      {t(`badge.${badge}`)}
    </span>
  )
}

/** Cabeçalho clicável asc → desc → neutro, com a direção ativa dita em texto e no `aria-sort`. */
export function ContractorTable({
  contractors,
  onOpen,
  profiles,
  table,
}: ContractorTableProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')

  function sortStateOf(column: ContractorSortColumn): SortState {
    if (table.state.sort?.column !== column) return 'none'
    return table.state.sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function renderSortHeader(column: ContractorSortColumn, label: string): JSX.Element {
    const sortState = sortStateOf(column)
    const sortLabel = {
      ascending: t('table.sortAscending'),
      descending: t('table.sortDescending'),
      none: t('table.sortNone'),
    }[sortState]
    return (
      <th aria-sort={sortState} scope="col">
        <button
          className={styles.sortButton}
          onClick={() => table.toggleSort(column)}
          type="button"
        >
          {label}
          <span aria-hidden="true" className={styles.sortIndicator}>
            {SORT_INDICATOR[sortState]}
          </span>
          <span className={styles.srOnly}>{sortLabel}</span>
        </button>
      </th>
    )
  }

  return (
    <div aria-label={t('table.region')} className={styles.tableScroll} role="region" tabIndex={0}>
      <table className={styles.table}>
        <thead>
          <tr>
            {renderSortHeader('name', t('table.name'))}
            {renderSortHeader('taxId', t('table.taxId'))}
            {renderSortHeader('status', t('table.status'))}
            <th scope="col">{t('table.receiving')}</th>
            <th scope="col">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {contractors.map((contractor) => {
            const name = contractor.displayName === '' ? t('table.unnamed') : contractor.displayName
            return (
              <tr key={contractor.id}>
                <td>{name}</td>
                <td className={styles.document}>{formatTaxId(contractor.taxId)}</td>
                <td>{t(`status.${contractor.status}`)}</td>
                <td>
                  <ReceivingBadgeCell summary={profiles.get(contractor.id)} />
                </td>
                <td>
                  <Button
                    aria-label={t('table.openLabel', { name })}
                    onClick={() => onOpen(contractor.id)}
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="edit" />
                    {t('table.open')}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
