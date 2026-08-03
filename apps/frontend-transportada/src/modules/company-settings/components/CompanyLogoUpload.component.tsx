/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { COMPANY_LOGO_ACCEPT, resolveLogoRejection } from '../shared/companyLogo.validation'
import type { CompanyLogoImage, CompanyLogoMetadata } from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'

type CompanyLogoUploadProps = Readonly<{
  disabled: boolean
  logo: CompanyLogoImage | null
  onRemove: () => Promise<void>
  onSubmit: (file: File) => Promise<CompanyLogoMetadata>
}>

type LogoStatusKey =
  | 'logoError'
  | 'logoErrorNetwork'
  | 'logoErrorTooLarge'
  | 'logoErrorUnsupported'
  | 'logoRemoved'
  | 'logoSaved'

type LogoStatus = Readonly<{ key: 'idle' }> | Readonly<{ code?: string; key: LogoStatusKey }>

function resolveLogoStatus(error: unknown): LogoStatus {
  const code = error instanceof Error ? error.message : ''
  if (code === 'COMPANY_LOGO_TOO_LARGE') return { key: 'logoErrorTooLarge' }
  if (code === 'COMPANY_LOGO_UNSUPPORTED_FORMAT') return { key: 'logoErrorUnsupported' }
  if (code === 'COMPANY_SETTINGS_NETWORK_ERROR') return { key: 'logoErrorNetwork' }
  return { code: code || 'UNKNOWN_ERROR', key: 'logoError' }
}

function LogoPreview({ logo }: Readonly<{ logo: CompanyLogoImage | null }>) {
  const { t } = useTranslation('companySettings')
  if (logo === null) return <p className={styles.logoEmpty}>{t('logoEmpty')}</p>
  return <img alt={t('logoPreviewAlt')} className={styles.logoPreviewImage} src={logo.dataUrl} />
}

function LogoRemoveAction(
  props: Readonly<{
    disabled: boolean
    onConfirm: () => void
  }>,
) {
  const { t } = useTranslation('companySettings')
  const [confirming, setConfirming] = useState(false)
  if (!confirming)
    return (
      <button
        className={styles.secondaryAction}
        disabled={props.disabled}
        type="button"
        onClick={() => setConfirming(true)}
      >
        <Icon name="trash" />
        {t('removeLogo')}
      </button>
    )
  return (
    <div className={styles.certificateDeleteConfirm}>
      <p>{t('removeLogoConfirmation')}</p>
      <div className={styles.certificateDeleteButtons}>
        <button
          className={styles.secondaryAction}
          disabled={props.disabled}
          type="button"
          onClick={() => setConfirming(false)}
        >
          <Icon name="close" />
          {t('cancelRemoveLogo')}
        </button>
        <button
          className={styles.dangerAction}
          disabled={props.disabled}
          type="button"
          onClick={() => {
            setConfirming(false)
            props.onConfirm()
          }}
        >
          <Icon name="check" />
          {t('confirmRemoveLogo')}
        </button>
      </div>
    </div>
  )
}

export function CompanyLogoUpload({ disabled, logo, onRemove, onSubmit }: CompanyLogoUploadProps) {
  const { t } = useTranslation('companySettings')
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [status, setStatus] = useState<LogoStatus>({ key: 'idle' })

  function clearFileInput() {
    if (fileInput.current !== null) fileInput.current.value = ''
  }

  function handleSelect(file: File) {
    const rejection = resolveLogoRejection(file)
    clearFileInput()
    if (rejection !== null) {
      setFileName(null)
      setStatus(resolveLogoStatus(new Error(rejection)))
      return
    }
    setFileName(file.name)
    void onSubmit(file)
      .then(() => setStatus({ key: 'logoSaved' }))
      .catch((error: unknown) => setStatus(resolveLogoStatus(error)))
  }

  function handleRemove() {
    setFileName(null)
    void onRemove()
      .then(() => setStatus({ key: 'logoRemoved' }))
      .catch((error: unknown) => setStatus(resolveLogoStatus(error)))
  }

  return (
    <section className={styles.certificateForm} aria-labelledby="company-logo-title">
      <h2 id="company-logo-title">{t('logoTitle')}</h2>
      <p className={styles.fieldHint}>{t('logoHint')}</p>
      <div className={styles.logoPreview}>
        <LogoPreview logo={logo} />
      </div>
      <label className={styles.fileUploadLabel}>
        <span>{t('logoTitle')}</span>
        <input
          accept={COMPANY_LOGO_ACCEPT}
          className={styles.fileUploadInput}
          disabled={disabled}
          ref={fileInput}
          type="file"
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? [])
            if (file !== undefined) handleSelect(file)
          }}
        />
        <button
          className={styles.fileUploadButton}
          disabled={disabled}
          type="button"
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="image" />
          <span>{t('chooseLogoFile')}</span>
        </button>
        <span className={styles.fileUploadName}>{fileName ?? t('noLogoSelected')}</span>
      </label>
      {logo !== null && (
        <div className={styles.certificateDeleteAction}>
          <LogoRemoveAction disabled={disabled} onConfirm={handleRemove} />
        </div>
      )}
      {status.key !== 'idle' && (
        <p
          className={
            status.key === 'logoSaved' || status.key === 'logoRemoved'
              ? styles.formStatusSuccess
              : styles.formStatusError
          }
          role="status"
        >
          {t(status.key, { code: status.code })}
        </p>
      )}
    </section>
  )
}
