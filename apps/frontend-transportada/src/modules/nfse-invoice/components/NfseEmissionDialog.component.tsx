/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { UseNfseEmissionDialogResult } from '../hooks/useNfseEmissionDialog.hook'
import {
  NFSE_DESCRIPTION_VARIABLES,
  selectNfseEmissionMessageKey,
  type NfseEmissionRow,
} from '../shared/nfseEmission.service'
import { toIssRatePercent } from '../shared/nfseProfileForm.service'
import styles from '../styles/nfseInvoice.module.css'

type NfseEmissionDialogProps = Readonly<{
  dialog: UseNfseEmissionDialogResult
}>

const SKELETON_ROWS = 3

export function NfseEmissionDialog({ dialog }: NfseEmissionDialogProps) {
  const { t } = useTranslation('nfseInvoice')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: dialog.isOpen,
    onClose: dialog.close,
  })

  if (!dialog.isOpen) return null

  const profileOptions: readonly SelectOption[] = dialog.profileOptions
  const messageKey = selectNfseEmissionMessageKey({
    errorCode: dialog.errorCode,
    status: dialog.status,
  })

  function renderRow(row: NfseEmissionRow) {
    return (
      <tr key={row.id}>
        <td>
          {row.takerLegalName}
          <span className={styles.emissionHint}>{row.description}</span>
        </td>
        <td>
          <span className={styles.emissionHint}>
            {t('emission.documents', { count: row.documentCount })}
          </span>
          {row.omittedDocuments > 0 && (
            <span className={styles.emissionHint}>
              {t('emission.omittedDocuments', { count: row.omittedDocuments })}
            </span>
          )}
        </td>
        <td className={styles.amountCell}>{formatAmount(row.serviceAmount)}</td>
        {/* A API manda a alíquota como fração (`0.020000`): o percentual é o que se lê na nota. */}
        <td className={styles.amountCell}>{`${toIssRatePercent(row.issRate)}%`}</td>
        <td className={styles.amountCell}>{formatAmount(row.issAmount)}</td>
      </tr>
    )
  }

  // Fora de `document.body` o overlay herdaria o bloco de contenção da transição de página, e o
  // `position: fixed` deixaria de se referir à viewport.
  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-emission-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-emission-title">{t('emission.title')}</h2>
            <p className={styles.emissionHint}>
              {t('emission.subtitle', { count: dialog.selectedCount })}
            </p>
          </div>
          <button
            aria-label={t('emission.close')}
            className={styles.iconAction}
            onClick={dialog.close}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.emissionForm}>
          <div className={styles.emissionField}>
            <span>{t('emission.profile')}</span>
            <Select
              ariaLabel={t('emission.profile')}
              clearable={false}
              disabled={dialog.isFormLocked || profileOptions.length === 0}
              onChange={dialog.setProfileId}
              options={profileOptions}
              placeholder={t('emission.profilePlaceholder')}
              value={dialog.profileId ?? ''}
            />
          </div>
          <label className={styles.emissionField}>
            <span>{t('emission.period')}</span>
            <input
              disabled={dialog.isFormLocked}
              onChange={(event) => dialog.setPeriod(event.target.value)}
              type="text"
              value={dialog.period}
            />
            <span className={styles.emissionHint}>{t('emission.periodHint')}</span>
          </label>
          <label className={styles.emissionField}>
            <span>{t('emission.description')}</span>
            <textarea
              disabled={dialog.isFormLocked}
              onChange={(event) => dialog.setDescription(event.target.value)}
              rows={3}
              value={dialog.description}
            />
            <span className={styles.emissionHint}>
              {t('emission.descriptionHint', {
                variables: NFSE_DESCRIPTION_VARIABLES.join(', '),
              })}
            </span>
          </label>
        </div>

        {!dialog.canIssue && <p className={styles.placeholder}>{t('emission.forbidden')}</p>}
        {!dialog.canListProfiles && (
          <p className={styles.placeholder}>{t('emission.profileUnavailable')}</p>
        )}

        {dialog.status === 'loading' && (
          <SkeletonGroup
            className={styles.emissionTableWrap}
            label={t('emission.loading', { count: dialog.selectedCount })}
          >
            <table className={styles.emissionTable}>
              <tbody>
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <tr key={index}>
                    <td>
                      <Skeleton variant="text" width="70%" />
                    </td>
                    <td>
                      <Skeleton variant="text" width="40%" />
                    </td>
                    <td>
                      <Skeleton variant="text" width="60%" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SkeletonGroup>
        )}

        {dialog.summary !== null && (
          <section className={styles.emissionSection}>
            <h3>{t('emission.projections')}</h3>
            {dialog.summary.rows.length === 0 ? (
              <p className={styles.placeholder}>{t('emission.empty')}</p>
            ) : (
              <div className={styles.emissionTableWrap}>
                <table className={styles.emissionTable}>
                  <thead>
                    <tr>
                      <th scope="col">{t('emission.columns.taker')}</th>
                      <th scope="col">{t('emission.columns.documents')}</th>
                      <th scope="col">{t('emission.columns.serviceAmount')}</th>
                      <th scope="col">{t('emission.columns.issRate')}</th>
                      <th scope="col">{t('emission.columns.issAmount')}</th>
                    </tr>
                  </thead>
                  <tbody>{dialog.visibleRows.map(renderRow)}</tbody>
                </table>
              </div>
            )}
            {dialog.hiddenRowCount > 0 && (
              <p className={styles.emissionHint}>
                {t('emission.moreRows', { count: dialog.hiddenRowCount })}
              </p>
            )}
            <p className={styles.emissionTotal}>
              {t('emission.totalService')}:{' '}
              <strong>{formatAmount(dialog.summary.totalServiceAmount)}</strong>
              {' · '}
              {t('emission.totalIss')}:{' '}
              <strong>{formatAmount(dialog.summary.totalIssAmount)}</strong>
            </p>
          </section>
        )}

        {dialog.blockGroups.length > 0 && (
          <section className={styles.emissionSection}>
            <h3>{t('emission.blocked')}</h3>
            <ul className={styles.emissionBlocks}>
              {dialog.blockGroups.map((group) => (
                <li key={group.reason}>
                  {t(`emission.blockReason.${group.reason}`, { defaultValue: group.reason })}
                  {' — '}
                  {group.labels.join(', ')}
                  {group.remainingCount > 0 &&
                    ` ${t('emission.blockedMore', { count: group.remainingCount })}`}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Junto do botão que falhou: 192px acima e com a cor do texto auxiliar, ninguém a lia. */}
        {messageKey !== null && (
          <p className={styles.emissionAlert} role="alert">
            <Icon name="alert" />
            {t(messageKey)}
          </p>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={dialog.close} type="button">
            <Icon name="close" />
            {t('emission.cancel')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={!dialog.canConfirm}
            onClick={dialog.confirm}
            type="button"
          >
            <Icon name="check" />
            {dialog.status === 'creating' ? t('emission.creating') : t('emission.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
