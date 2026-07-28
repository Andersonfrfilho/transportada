/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../styles/nfeWorkspace.module.css'

type NfeUploadPanelProps = Readonly<{
  readonly canImport: boolean
  readonly fileInputKey: string
  readonly onFileSelection: (files: readonly File[]) => void
  readonly onUploadSubmit: () => void
  readonly selectedFiles: readonly File[]
  readonly uploadFailed: boolean
  readonly uploadFileStatuses: Readonly<
    Record<string, 'pending' | 'uploading' | 'uploaded' | 'failed'>
  >
  readonly uploadPending: boolean
  readonly uploadSucceeded: boolean
}>

export function NfeUploadPanel(props: NfeUploadPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  const fileInput = useRef<HTMLInputElement>(null)

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
            ref={fileInput}
            onChange={handleFileChange}
            type="file"
          />
          <button
            className={styles.fileSelectButton}
            disabled={props.uploadPending}
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              fileInput.current?.click()
            }}
          >
            <UploadIcon />
            {t('upload.select')}
          </button>
        </label>
        <button
          className={styles.primaryAction}
          disabled={!props.canImport || props.uploadPending || props.selectedFiles.length === 0}
          onClick={props.onUploadSubmit}
          type="button"
        >
          {props.uploadPending ? (
            <>
              <SpinnerIcon />
              {t('upload.pending')}
            </>
          ) : (
            <>
              <UploadIcon />
              {t('upload.submit')}
            </>
          )}
        </button>
      </div>
      {props.uploadPending && (
        <p className={styles.uploadStatusPending} role="status">
          {t('upload.pending')}
        </p>
      )}
      {!props.uploadPending && props.uploadSucceeded && (
        <p className={styles.uploadStatusSuccess} role="status">
          {t('upload.success')}
        </p>
      )}
      {!props.uploadPending && props.uploadFailed && (
        <p className={styles.uploadStatusError} role="alert">
          {t('upload.error')}
        </p>
      )}
      <ul className={styles.fileList}>
        {props.selectedFiles.length === 0 && <li>{t('upload.empty')}</li>}
        {props.selectedFiles.map((file) => (
          <li key={`${file.name}:${file.size}`}>
            <span>{file.name}</span>
            <span
              className={styles.fileStatus}
              data-status={
                props.uploadFileStatuses[`${file.name}:${file.size}:${file.lastModified}`] ??
                'pending'
              }
            >
              {statusLabel(
                t,
                props.uploadFileStatuses[`${file.name}:${file.size}:${file.lastModified}`] ??
                  'pending',
              )}
            </span>
            <span>{Intl.NumberFormat('pt-BR').format(file.size)} B</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function statusLabel(
  translate: (key: string) => string,
  status: 'pending' | 'uploading' | 'uploaded' | 'failed',
): string {
  return translate(`upload.fileStatus.${status}`)
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 15v4h14v-4" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg
      aria-hidden="true"
      className={`${styles.actionIcon} ${styles.spinnerIcon}`}
      viewBox="0 0 24 24"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}
