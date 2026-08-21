/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useFreightRegionImport } from '../hooks/useFreightRegionImport.hook'
import styles from '../styles/fleet.module.css'

type FreightRegionImportDialogProps = Readonly<{
  companyId: string | undefined
  onClose: () => void
}>

type ImportFileFieldProps = Readonly<{
  hint: string
  label: string
  name: string
  onPick: (file: File) => Promise<void>
}>

function ImportFileField({ hint, label, name, onPick }: ImportFileFieldProps) {
  const { t } = useTranslation('fleet')

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (file === undefined) return
    void onPick(file)
  }

  return (
    <label className={styles.importField}>
      <span>{label}</span>
      <input accept=".csv,.txt" onChange={handleChange} type="file" />
      <span className={styles.hint}>{name === '' ? hint : t('regionImport.picked', { name })}</span>
    </label>
  )
}

export function FreightRegionImportDialog({ companyId, onClose }: FreightRegionImportDialogProps) {
  const { t } = useTranslation('fleet')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const importer = useFreightRegionImport({ companyId })
  const { summary } = importer

  return createPortal(
    <div className={styles.driverDialogOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="freight-region-import-title"
        aria-modal="true"
        className={styles.driverDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.driverDialogHeader}>
          <h2 id="freight-region-import-title">{t('regionImport.title')}</h2>
          <button
            aria-label={t('cancel')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        <p className={styles.hint}>{t('regionImport.hint')}</p>
        <ImportFileField
          hint={t('regionImport.regionsHint')}
          label={t('regionImport.regions')}
          name={importer.draft.regionsName}
          onPick={importer.pickRegions}
        />
        <ImportFileField
          hint={t('regionImport.ratesHint')}
          label={t('regionImport.rates')}
          name={importer.draft.ratesName}
          onPick={importer.pickRates}
        />
        {importer.blockReason === null ? null : (
          <p className={styles.feedback} role="status">
            {t(`regionImport.blocked.${importer.blockReason}`)}
          </p>
        )}
        {importer.feedbackKey === null ? null : (
          <p className={styles.feedback} role="status">
            {t('regionImport.failed')}
          </p>
        )}
        {summary === null ? null : (
          <div className={styles.importSummary} role="status">
            <strong>{t('regionImport.summaryTitle')}</strong>
            <ul>
              <li>{t('regionImport.created', { count: summary.created })}</li>
              <li>{t('regionImport.updated', { count: summary.updated })}</li>
              <li>{t('regionImport.deactivated', { count: summary.deactivated })}</li>
            </ul>
          </div>
        )}
        <div className={styles.formActions}>
          <Button onClick={onClose} type="button" variant="ghost">
            <Icon name="close" />
            {t('cancel')}
          </Button>
          <Button disabled={importer.isSaving} onClick={() => void importer.submit()} type="button">
            <Icon name="upload" />
            {importer.isSaving ? t('regionImport.busy') : t('regionImport.submit')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
