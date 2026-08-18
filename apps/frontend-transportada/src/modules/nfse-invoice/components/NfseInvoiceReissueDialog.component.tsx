/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfseInvoiceRowActionsController } from '../hooks/useNfseInvoiceRowActions.hook'
import styles from '../styles/nfseInvoice.module.css'
import { NFSE_ISS_EXIGIBILITIES, type NfseIssExigibility } from '../shared/nfseSettings.types'

type NfseInvoiceReissueDialogProps = Readonly<{
  actions: NfseInvoiceRowActionsController
}>

const ISS_EXIGIBILITY_LABEL_KEYS: Readonly<Record<NfseIssExigibility, string>> = {
  '1': 'nfseIssExigibility1',
  '2': 'nfseIssExigibility2',
  '3': 'nfseIssExigibility3',
  '4': 'nfseIssExigibility4',
  '5': 'nfseIssExigibility5',
  '6': 'nfseIssExigibility6',
  '7': 'nfseIssExigibility7',
}

const DESCRIPTION_ROWS = 3

export function NfseInvoiceReissueDialog({ actions }: NfseInvoiceReissueDialogProps) {
  const { t } = useTranslation('nfseInvoice')
  const isOpen = actions.reissueTarget !== null
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose: actions.closeReissue })

  if (actions.reissueTarget === null) return null

  const invoice = actions.reissueTarget
  const lastPayload = actions.reissueLastPayload
  const draft = actions.reissueDraft
  const isFieldsDisabled = actions.isReissuePending

  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-reissue-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-reissue-title">{t('reissueDialog.title')}</h2>
            <p className={styles.emissionHint}>
              {invoice.takerLegalName} · {formatAmount(invoice.serviceAmount)}
            </p>
          </div>
          <button
            aria-label={t('reissueDialog.close')}
            className={styles.iconAction}
            onClick={actions.closeReissue}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {lastPayload === null ? (
          <p className={styles.placeholder}>
            {actions.isReissueDetailLoading
              ? t('reissueDialog.loading')
              : t('reissueDialog.failed')}
          </p>
        ) : (
          <>
            <div className={styles.emissionForm}>
              <label className={styles.emissionField}>
                <span>{t('reissueDialog.cnaeCode')}</span>
                <input
                  disabled={isFieldsDisabled}
                  onChange={(event) => actions.setReissueField({ cnaeCode: event.target.value })}
                  value={draft.cnaeCode ?? lastPayload.cnaeCode}
                />
              </label>

              <label className={styles.emissionField}>
                <span>{t('reissueDialog.serviceListItem')}</span>
                <input
                  disabled={isFieldsDisabled}
                  onChange={(event) =>
                    actions.setReissueField({ serviceListItem: event.target.value })
                  }
                  value={draft.serviceListItem ?? lastPayload.serviceListItem}
                />
              </label>

              <label className={styles.emissionField}>
                <span>{t('reissueDialog.municipalityIbgeCode')}</span>
                <input
                  disabled={isFieldsDisabled}
                  onChange={(event) =>
                    actions.setReissueField({ municipalityIbgeCode: event.target.value })
                  }
                  value={draft.municipalityIbgeCode ?? lastPayload.municipalityIbgeCode}
                />
              </label>

              <label className={styles.emissionField}>
                <span>{t('reissueDialog.municipalTaxationCode')}</span>
                <input
                  disabled={isFieldsDisabled}
                  onChange={(event) =>
                    actions.setReissueField({ municipalTaxationCode: event.target.value })
                  }
                  value={draft.municipalTaxationCode ?? lastPayload.municipalTaxationCode}
                />
              </label>

              <label className={styles.emissionField}>
                <span>{t('reissueDialog.nbsCode')}</span>
                <input
                  disabled={isFieldsDisabled}
                  onChange={(event) => actions.setReissueField({ nbsCode: event.target.value })}
                  value={draft.nbsCode ?? lastPayload.nbsCode}
                />
              </label>

              <label className={styles.emissionField}>
                <span>{t('reissueDialog.issRate')}</span>
                <input
                  disabled={isFieldsDisabled}
                  onChange={(event) => actions.setReissueField({ issRate: event.target.value })}
                  value={draft.issRate ?? lastPayload.issRate}
                />
              </label>

              <label className={styles.emissionField}>
                <span>{t('reissueDialog.issExigibility')}</span>
                <Select
                  ariaLabel={t('reissueDialog.issExigibility')}
                  disabled={isFieldsDisabled}
                  onChange={(value) => actions.setReissueField({ issExigibility: value })}
                  options={NFSE_ISS_EXIGIBILITIES.map((exigibility) => ({
                    label: t(ISS_EXIGIBILITY_LABEL_KEYS[exigibility]),
                    value: exigibility,
                  }))}
                  value={draft.issExigibility ?? lastPayload.issExigibility}
                />
              </label>

              <Checkbox
                checked={draft.issWithheld ?? lastPayload.issWithheld}
                disabled={isFieldsDisabled}
                label={t('reissueDialog.issWithheld')}
                onChange={(checked) => actions.setReissueField({ issWithheld: checked })}
              />

              <label className={styles.emissionField}>
                <span>{t('reissueDialog.description')}</span>
                <textarea
                  disabled={isFieldsDisabled}
                  onChange={(event) => actions.setReissueField({ description: event.target.value })}
                  rows={DESCRIPTION_ROWS}
                  value={draft.description ?? lastPayload.description}
                />
              </label>
            </div>

            <dl className={styles.detailList}>
              <div>
                <dt>{t('reissueDialog.serviceAmount')}</dt>
                <dd>{formatAmount(lastPayload.serviceAmount)}</dd>
              </div>
              <div>
                <dt>{t('reissueDialog.issAmount')}</dt>
                <dd>{formatAmount(lastPayload.issAmount)}</dd>
              </div>
              <div>
                <dt>{t('reissueDialog.takerLegalName')}</dt>
                <dd>{lastPayload.takerLegalName}</dd>
              </div>
              <div>
                <dt>{t('reissueDialog.documentCount')}</dt>
                <dd>{lastPayload.documentCount}</dd>
              </div>
            </dl>
          </>
        )}

        {actions.reissueErrorCode !== null && (
          <p className={styles.placeholder} role="alert">
            {t('reissueDialog.failed')}
          </p>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={actions.closeReissue} type="button">
            <Icon name="close" />
            {t('reissueDialog.back')}
          </button>
          <button
            className={styles.primaryAction}
            disabled={lastPayload === null || actions.isReissuePending}
            onClick={actions.confirmReissue}
            type="button"
          >
            <Icon name="refresh" />
            {actions.isReissuePending ? t('reissueDialog.sending') : t('reissueDialog.confirm')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
