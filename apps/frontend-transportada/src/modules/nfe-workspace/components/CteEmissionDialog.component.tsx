/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AUTOMATIC_PROFILE_ID,
  CTE_EMISSION_GROUPING_MODES,
  type CteEmissionRow,
} from '../shared/cteEmission.service'
import type { UseCteEmissionDialogResult } from '../hooks/useCteEmissionDialog.hook'
import styles from '../styles/nfeWorkspace.module.css'
import { SelectMenu, type SelectMenuOption } from './SelectMenu.component'

type CteEmissionDialogProps = Readonly<{
  dialog: UseCteEmissionDialogResult
}>

const amountFormatter = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

function formatAmount(value: string): string {
  const numeric = Number(value)
  return Number.isNaN(numeric) ? value : amountFormatter.format(numeric)
}

export function CteEmissionDialog({ dialog }: CteEmissionDialogProps) {
  const { t } = useTranslation('nfeWorkspace')

  if (!dialog.isOpen) return null

  const profileOptions: readonly SelectMenuOption[] = [
    { label: t('cteEmission.profileAutomatic'), value: AUTOMATIC_PROFILE_ID },
    ...dialog.profileOptions.map((option) => ({ label: option.name, value: option.id })),
  ]
  const groupingOptions: readonly SelectMenuOption[] = CTE_EMISSION_GROUPING_MODES.map((mode) => ({
    label: t(`cteEmission.groupingMode.${mode}`),
    value: mode,
  }))

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') dialog.close()
  }

  function renderRow(row: CteEmissionRow) {
    return (
      <tr key={row.id}>
        <td>
          <span className={styles.cteEmissionNotes}>{row.documentNumbers.join(', ')}</span>
          <span className={styles.cteEmissionComponents}>
            {row.components.map((component) => component.label).join(' + ')}
          </span>
        </td>
        <td className={styles.amountCell}>{formatAmount(row.baseAmount)}</td>
        <td className={styles.amountCell}>{`${row.percentageLabel}%`}</td>
        <td>
          {row.profileName}
          <span className={styles.cteEmissionComponents}>
            {t(`cteEmission.resolvedBy.${row.resolvedBy}`)}
          </span>
        </td>
        <td className={styles.amountCell}>{formatAmount(row.fiscalAmount)}</td>
      </tr>
    )
  }

  return (
    <div className={styles.cteEmissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="cte-emission-title"
        aria-modal="true"
        className={styles.cteEmissionDialog}
        role="dialog"
      >
        <header className={styles.cteEmissionHeader}>
          <div>
            <h2 id="cte-emission-title">{t('cteEmission.title')}</h2>
            <p className={styles.cteEmissionSubtitle}>{t('cteEmission.subtitle')}</p>
          </div>
          <button
            aria-label={t('cteEmission.close')}
            className={styles.iconAction}
            onClick={dialog.close}
            type="button"
          >
            ×
          </button>
        </header>

        <div className={styles.cteEmissionForm}>
          <label className={styles.cteEmissionField}>
            <span>{t('cteEmission.batchName')}</span>
            <input
              className={styles.filterInput}
              onChange={(event) => dialog.setName(event.target.value)}
              type="text"
              value={dialog.name}
            />
          </label>
          <div className={styles.cteEmissionField}>
            <span>{t('cteEmission.profile')}</span>
            <SelectMenu
              ariaLabel={t('cteEmission.profile')}
              clearable={false}
              onChange={dialog.setProfileId}
              options={profileOptions}
              placeholder={t('cteEmission.profileAutomatic')}
              value={dialog.profileId}
            />
          </div>
          <div className={styles.cteEmissionField}>
            <span>{t('cteEmission.grouping')}</span>
            <SelectMenu
              ariaLabel={t('cteEmission.grouping')}
              clearable={false}
              onChange={(value) =>
                dialog.setGroupingMode(
                  value === 'sender_recipient' ? 'sender_recipient' : 'per_invoice',
                )
              }
              options={groupingOptions}
              placeholder={t('cteEmission.groupingMode.per_invoice')}
              value={dialog.groupingMode}
            />
          </div>
        </div>

        {!dialog.canEmit && <p className={styles.emptyState}>{t('cteEmission.forbidden')}</p>}
        {dialog.status === 'loading' && (
          <p className={styles.emptyState}>{t('cteEmission.loading')}</p>
        )}
        {dialog.status === 'error' && <p className={styles.emptyState}>{t('cteEmission.error')}</p>}

        {dialog.summary !== null && (
          <section className={styles.cteEmissionSection}>
            <h3>{t('cteEmission.projections')}</h3>
            {dialog.summary.rows.length === 0 ? (
              <p className={styles.emptyState}>{t('cteEmission.empty')}</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t('cteEmission.columns.documents')}</th>
                      <th scope="col">{t('cteEmission.columns.baseAmount')}</th>
                      <th scope="col">{t('cteEmission.columns.percentage')}</th>
                      <th scope="col">{t('cteEmission.columns.profile')}</th>
                      <th scope="col">{t('cteEmission.columns.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>{dialog.summary.rows.map(renderRow)}</tbody>
                </table>
              </div>
            )}
            <p className={styles.cteEmissionTotal}>
              {t('cteEmission.total')}: <strong>{formatAmount(dialog.summary.totalAmount)}</strong>
            </p>
          </section>
        )}

        {dialog.blockGroups.length > 0 && (
          <section className={styles.cteEmissionSection}>
            <h3>{t('cteEmission.blocked')}</h3>
            <ul className={styles.cteEmissionBlocks}>
              {dialog.blockGroups.map((group) => (
                <li key={group.reason}>
                  {t(`cteEmission.blockReason.${group.reason}`, { defaultValue: group.reason })} —{' '}
                  {t('cteEmission.blockedCount', { count: group.documentIds.length })}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className={styles.cteEmissionFooter}>
          <button className={styles.ghostAction} onClick={dialog.close} type="button">
            {t('cteEmission.cancel')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={!dialog.canConfirm}
            onClick={dialog.confirm}
            type="button"
          >
            {dialog.status === 'creating' ? t('cteEmission.creating') : t('cteEmission.confirm')}
          </button>
        </footer>
      </div>
    </div>
  )
}
