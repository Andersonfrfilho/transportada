/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import styles from '../styles/nfeWorkspace.module.css'

type NfeUploadPanelProps = Readonly<{
  readonly canImport: boolean
  readonly distributionPending: boolean
  readonly fileInputKey: string
  readonly onDistributionRequest: () => void
  readonly onFileSelection: (files: readonly File[]) => void
  readonly onUploadSubmit: () => void
  readonly selectedFiles: readonly File[]
  readonly uploadPending: boolean
}>

export function NfeUploadPanel(props: NfeUploadPanelProps) {
  const { t } = useTranslation('nfeWorkspace')

  if (!props.canImport) {
    return null
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    props.onFileSelection(Array.from(event.target.files ?? []))
  }

  return (
    <section className={styles.controlPanel} aria-labelledby="nfe-upload-panel-title">
      <div className={styles.panelHeading}>
        <h2 id="nfe-upload-panel-title">{t('upload.title')}</h2>
        <p>{t('upload.subtitle')}</p>
      </div>
      <div className={styles.actionRow}>
        <label className={styles.fileField}>
          <span>{t('upload.files')}</span>
          <input
            accept=".xml,.zip,application/xml,application/zip"
            disabled={!props.canImport || props.uploadPending}
            key={props.fileInputKey}
            multiple
            onChange={handleFileChange}
            type="file"
          />
        </label>
        <button
          className={styles.primaryAction}
          disabled={!props.canImport || props.uploadPending || props.selectedFiles.length === 0}
          onClick={props.onUploadSubmit}
          type="button"
        >
          {t('upload.submit')}
        </button>
        <button
          className={styles.secondaryAction}
          disabled={!props.canImport || props.distributionPending}
          onClick={props.onDistributionRequest}
          type="button"
        >
          {t('distribution.submit')}
        </button>
      </div>
      <ul className={styles.fileList}>
        {props.selectedFiles.length === 0 && <li>{t('upload.empty')}</li>}
        {props.selectedFiles.map((file) => (
          <li key={`${file.name}:${file.size}`}>
            <span>{file.name}</span>
            <span>{Intl.NumberFormat('pt-BR').format(file.size)} B</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
