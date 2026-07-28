/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type RefObject, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  createCertificateUploadController,
  type CertificateUploadController,
} from '../hooks/useCertificateUpload.hook'
import type { SafeCertificate } from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'

type CertificateUploadFormProps = Readonly<{
  certificate: SafeCertificate | undefined
  onDelete: () => Promise<void>
  disabled: boolean
  onSubmit: (body: FormData) => Promise<SafeCertificate>
}>

type CertificateStatusKey =
  | 'certificateError'
  | 'certificateErrorForbidden'
  | 'certificateErrorCnpjMismatch'
  | 'certificateErrorExpired'
  | 'certificateErrorInvalid'
  | 'certificateErrorMissingFields'
  | 'certificateErrorNetwork'
  | 'certificateErrorNotYetValid'
  | 'certificateErrorProfileMissing'
  | 'certificateErrorRequestFailed'
  | 'certificateErrorServer'
  | 'certificateErrorStorageUnavailable'
  | 'certificateErrorUnsupported'
  | 'deleted'
  | 'success'

type CertificateStatus =
  | Readonly<{
      key: Exclude<CertificateStatusKey, 'success'>
      code?: string
    }>
  | Readonly<{ key: 'success'; certificate: SafeCertificate }>
  | Readonly<{ key: 'idle' }>

type CertificateInputsProps = Readonly<{
  controller: CertificateUploadController
  disabled: boolean
  fileName: string | null
  fileInput: RefObject<HTMLInputElement | null>
  passwordVisible: boolean
  onPickFile: () => void
  onSelectFileName: (value: string) => void
  passwordInput: RefObject<HTMLInputElement | null>
  onTogglePasswordVisibility: () => void
}>

function UploadIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 15v4h14v-4" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M12 3 5 6v5c0 4.5 2.8 8.4 7 10 4.2-1.6 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M2.062 11.99C3.173 7.39 7.1 3.9 12 3.9s8.827 3.49 9.938 8.09c-.39 1.75-1.36 3.26-2.73 4.4" />
      <path d="M9.88 9.88a3 3 0 1 1 4.24 4.24 3 3 0 0 1-4.24-4.24" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M2.062 11.99C3.173 7.39 7.1 3.9 12 3.9c4.9 0 8.827 3.49 9.938 8.09-.39 1.75-1.36 3.26-2.73 4.4" />
      <path d="m2 2 20 20" />
      <path d="M9.88 9.88a3 3 0 0 1 4.24 4.24" />
    </svg>
  )
}

function CertificateInputs(props: CertificateInputsProps) {
  const { t } = useTranslation('companySettings')
  const passwordVisibilityLabel = props.passwordVisible ? t('hidePassword') : t('showPassword')
  return (
    <>
      <label className={styles.fileUploadLabel}>
        <span>{t('certificateFile')}</span>
        <input
          accept=".pfx,application/x-pkcs12"
          className={styles.fileUploadInput}
          disabled={props.disabled}
          ref={props.fileInput}
          type="file"
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? [])
            if (file !== undefined) {
              props.controller.selectCertificate(file)
              props.onSelectFileName(file.name)
            }
          }}
        />
        <button
          className={styles.fileUploadButton}
          disabled={props.disabled}
          type="button"
          onClick={props.onPickFile}
        >
          <UploadIcon />
          <span>{t('chooseCertificateFile')}</span>
        </button>
        <span className={styles.fileUploadName}>
          {props.fileName ?? t('noCertificateFileSelected')}
        </span>
      </label>
      <label>
        <span>{t('certificatePassword')}</span>
        <div className={styles.passwordRevealField}>
          <input
            autoComplete="new-password"
            className={styles.passwordInput}
            disabled={props.disabled}
            ref={props.passwordInput}
            type={props.passwordVisible ? 'text' : 'password'}
            onChange={(event) => props.controller.setPassword(event.target.value)}
          />
          <button
            aria-label={passwordVisibilityLabel}
            className={styles.passwordRevealAction}
            disabled={props.disabled}
            title={passwordVisibilityLabel}
            type="button"
            onClick={props.onTogglePasswordVisibility}
          >
            {props.passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </label>
    </>
  )
}

export function CertificateUploadForm({
  certificate,
  disabled,
  onDelete,
  onSubmit,
}: CertificateUploadFormProps) {
  const { t } = useTranslation('companySettings')
  const fileInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const submitRef = useRef(onSubmit)
  submitRef.current = onSubmit
  const [fileName, setFileName] = useState<string | null>(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [status, setStatus] = useState<CertificateStatus>({ key: 'idle' })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const controllerRef = useRef<CertificateUploadController | null>(null)
  controllerRef.current ??= createCertificateUploadController({
    clearFileInput: () => {
      if (fileInput.current !== null) fileInput.current.value = ''
    },
    clearPasswordInput: () => {
      if (passwordInput.current !== null) passwordInput.current.value = ''
    },
    replaceCertificate: (body) => submitRef.current(body),
  })
  const controller = controllerRef.current
  const submit = () => {
    void controller
      .submit()
      .then((certificate) => {
        setFileName(null)
        setStatus({ certificate, key: 'success' })
      })
      .catch((error) => setStatus(resolveCertificateStatus(error)))
  }
  return (
    <section className={styles.certificateForm} aria-labelledby="certificate-title">
      <h2 id="certificate-title">{t('certificateTitle')}</h2>
      {certificate !== undefined && (
        <div className={styles.certificateCurrentRecord}>
          <div className={styles.certificateCurrentHeading}>
            <p className={styles.certificateSavedLabel}>{t('certificateCurrentLabel')}</p>
            <span className={styles.certificateCurrentStatus}>{t(certificate.status)}</span>
          </div>
          <p className={styles.certificateExpiry}>
            <span>{t('certificateExpiresLabel')}</span>
            {formatCertificateDate(certificate.expiresAt)}
          </p>
          <p className={styles.certificateMetadata}>
            {t('certificateStatus', {
              expiresAt: formatCertificateDate(certificate.expiresAt),
              status: t(certificate.status),
              validFrom: formatCertificateDate(certificate.validFrom),
              version: certificate.version,
            })}
          </p>
        </div>
      )}
      <CertificateInputs
        controller={controller}
        disabled={disabled}
        fileName={fileName}
        fileInput={fileInput}
        passwordVisible={passwordVisible}
        onPickFile={() => fileInput.current?.click()}
        onSelectFileName={setFileName}
        onTogglePasswordVisibility={() => setPasswordVisible((current) => !current)}
        passwordInput={passwordInput}
      />
      <button className={styles.primaryAction} disabled={disabled} type="button" onClick={submit}>
        <ShieldIcon />
        {t('replaceCertificate')}
      </button>
      {status.key === 'success' && (
        <div className={styles.certificateSavedRecord} role="status">
          <p className={styles.formStatusSuccess}>{t('success')}</p>
          <p className={styles.certificateSavedLabel}>{t('certificateSavedLabel')}</p>
          <p className={styles.certificateMetadata}>
            {t('certificateStatus', {
              expiresAt: formatCertificateDate(status.certificate.expiresAt),
              status: t(status.certificate.status),
              validFrom: formatCertificateDate(status.certificate.validFrom),
              version: status.certificate.version,
            })}
          </p>
        </div>
      )}
      {certificate !== undefined && (
        <div className={styles.certificateDeleteAction}>
          {!confirmDelete ? (
            <button
              className={styles.secondaryAction}
              disabled={disabled}
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              {t('removeCertificate')}
            </button>
          ) : (
            <div className={styles.certificateDeleteConfirm}>
              <p>{t('removeCertificateConfirmation')}</p>
              <div className={styles.certificateDeleteButtons}>
                <button
                  className={styles.secondaryAction}
                  disabled={disabled}
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('cancelRemoveCertificate')}
                </button>
                <button
                  className={styles.dangerAction}
                  disabled={disabled}
                  type="button"
                  onClick={() => {
                    void onDelete()
                      .then(() => {
                        setConfirmDelete(false)
                        setStatus({ key: 'deleted' })
                      })
                      .catch((error) => setStatus(resolveCertificateStatus(error)))
                  }}
                >
                  {t('confirmRemoveCertificate')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {status.key !== 'idle' && status.key !== 'success' && (
        <p className={styles.formStatusError} role="status">
          {t(status.key, { code: status.code })}
        </p>
      )}
    </section>
  )
}

function formatCertificateDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))
}

function resolveCertificateStatus(error: unknown): CertificateStatus {
  const code = error instanceof Error ? error.message : ''
  if (code === 'CERTIFICATE_UPLOAD_REQUIRED') return { key: 'certificateErrorMissingFields' }
  if (code === 'DIGITAL_CERTIFICATE_CNPJ_MISMATCH') return { key: 'certificateErrorCnpjMismatch' }
  if (code === 'DIGITAL_CERTIFICATE_PROFILE_MISSING')
    return { key: 'certificateErrorProfileMissing' }
  if (code === 'COMPANY_SETTINGS_REQUEST_FAILED')
    return { key: 'certificateErrorRequestFailed', code }
  if (code === 'COMPANY_SETTINGS_NETWORK_ERROR') return { key: 'certificateErrorNetwork' }
  if (code === 'FORBIDDEN' || code === 'UNAUTHENTICATED')
    return { key: 'certificateErrorForbidden', code }
  if (code === 'INTERNAL_ERROR') return { key: 'certificateErrorServer', code }
  if (
    code === 'DIGITAL_CERTIFICATE_OPERATION_FAILED' ||
    code === 'DIGITAL_CERTIFICATE_UNAVAILABLE'
  ) {
    return { key: 'certificateErrorStorageUnavailable', code }
  }
  if (code === 'CERTIFICATE_EXPIRED') return { key: 'certificateErrorExpired' }
  if (code === 'CERTIFICATE_NOT_YET_VALID') return { key: 'certificateErrorNotYetValid' }
  if (
    code === 'CERTIFICATE_CNPJ_MISSING' ||
    code === 'CERTIFICATE_NOT_ICP_BRASIL' ||
    code === 'CERTIFICATE_PRIVATE_KEY_MISSING' ||
    code === 'CERTIFICATE_SIGNATURE_UNAVAILABLE'
  ) {
    return { key: 'certificateErrorUnsupported', code }
  }
  if (code === 'CERTIFICATE_INVALID' || code === 'CERTIFICATE_VALIDATION_FAILED') {
    return { key: 'certificateErrorInvalid', code }
  }
  return { key: 'certificateError', code: code || 'UNKNOWN_ERROR' }
}
