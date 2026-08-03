/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  buildProfileSelectOptions,
  CTE_EMISSION_GROUPING_MODES,
  selectEmissionMessageKey,
  type CteEmissionRow,
} from '../shared/cteEmission.service'
import type { UseCteEmissionDialogResult } from '../hooks/useCteEmissionDialog.hook'
import styles from '../styles/nfeWorkspace.module.css'

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
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: dialog.isOpen,
    onClose: dialog.close,
  })

  if (!dialog.isOpen) return null

  const profileOptions: readonly SelectOption[] = buildProfileSelectOptions({
    automaticLabel: t('cteEmission.profileAutomatic'),
    profiles: dialog.profileOptions,
  })
  const groupingOptions: readonly SelectOption[] = CTE_EMISSION_GROUPING_MODES.map((mode) => ({
    label: t(`cteEmission.groupingMode.${mode}`),
    value: mode,
  }))
  const messageKey = selectEmissionMessageKey({
    errorCode: dialog.errorCode,
    status: dialog.status,
  })

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
            {t(`cteEmission.matchedBy.${row.matchedBy}`, { defaultValue: row.matchedBy })}
          </span>
        </td>
        <td className={styles.amountCell}>{formatAmount(row.fiscalAmount)}</td>
      </tr>
    )
  }

  // Fora de `document.body` o overlay herdaria o `transform` da transição de página como bloco
  // de contenção, e o `position: fixed` deixaria de se referir à viewport.
  return createPortal(
    <div className={styles.cteEmissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="cte-emission-title"
        aria-modal="true"
        className={styles.cteEmissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
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
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.cteEmissionForm}>
          <label className={styles.cteEmissionField}>
            <span>{t('cteEmission.batchName')}</span>
            <input
              disabled={dialog.isFormLocked}
              onChange={(event) => dialog.setName(event.target.value)}
              type="text"
              value={dialog.name}
            />
          </label>
          <div className={styles.cteEmissionField}>
            <span>{t('cteEmission.profile')}</span>
            <Select
              ariaLabel={t('cteEmission.profile')}
              clearable={false}
              disabled={dialog.isFormLocked}
              onChange={dialog.setProfileId}
              options={profileOptions}
              placeholder={t('cteEmission.profileAutomatic')}
              value={dialog.profileId}
            />
            {dialog.canManageProfiles && (
              <button
                className={styles.cteEmissionProfileLink}
                disabled={dialog.isFormLocked}
                onClick={dialog.openProfileSettings}
                type="button"
              >
                <Icon name="edit" />
                {t('cteEmission.manageProfiles')}
              </button>
            )}
          </div>
          <div className={styles.cteEmissionField}>
            <span>{t('cteEmission.grouping')}</span>
            <Select
              ariaLabel={t('cteEmission.grouping')}
              clearable={false}
              disabled={dialog.isFormLocked}
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
        {messageKey !== null && <p className={styles.emptyState}>{t(messageKey)}</p>}

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
            <Icon name="close" />
            {t('cteEmission.cancel')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={!dialog.canConfirm}
            onClick={dialog.confirm}
            type="button"
          >
            <Icon name="check" />
            {dialog.status === 'creating' ? t('cteEmission.creating') : t('cteEmission.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
