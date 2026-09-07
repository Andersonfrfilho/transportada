/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'

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
  /** Vários XML de uma vez: a caixa mostra a contagem, porque a lista inteira não cabe na linha. */
  const selectedNames =
    props.selectedFiles.length === 0
      ? ''
      : props.selectedFiles.length === 1
        ? (props.selectedFiles[0]?.name ?? '')
        : t('upload.selectedCount', { count: props.selectedFiles.length })

  if (!props.canImport) {
    return null
  }

  return (
    <section className={styles.controlPanel} aria-labelledby="nfe-upload-panel-title">
      <div className={styles.panelHeading}>
        <h2 id="nfe-upload-panel-title">{t('upload.title')}</h2>
        <p>{t('upload.subtitle')}</p>
      </div>
      <div className={styles.actionRow}>
        <FileField
          multiple
          accept=".xml,.zip,application/xml,application/zip"
          actionLabel={t('upload.select')}
          className={styles.fileField}
          disabled={!props.canImport || props.uploadPending}
          inputRef={fileInput}
          key={props.fileInputKey}
          label={t('upload.files')}
          placeholder={t('upload.noFileChosen')}
          {...(selectedNames === '' ? {} : { fileName: selectedNames })}
          onSelect={() => undefined}
          onSelectMany={(files) => props.onFileSelection([...files])}
        />
        <button
          className={styles.primaryAction}
          disabled={!props.canImport || props.uploadPending || props.selectedFiles.length === 0}
          onClick={props.onUploadSubmit}
          type="button"
        >
          {props.uploadPending ? (
            <>
              <Icon name="spinner" />
              {t('upload.pending')}
            </>
          ) : (
            <>
              <Icon name="upload" />
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
