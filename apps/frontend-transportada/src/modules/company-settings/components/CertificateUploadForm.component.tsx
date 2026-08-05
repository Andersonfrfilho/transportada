/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type RefObject, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import {
  createCertificateUploadController,
  type CertificateUploadController,
} from '../hooks/useCertificateUpload.hook'
import { CERTIFICATE_PURPOSE_LABEL_KEYS } from '../shared/companySettings.constant'
import {
  CERTIFICATE_PURPOSES,
  type CertificatePurpose,
  type SafeCertificate,
} from '../shared/companySettingsClient.service'
import type { ActiveCertificatesByPurpose } from '../shared/companySettingsViewModel.service'
import styles from '../styles/companySettings.module.css'

type CertificateUploadFormProps = Readonly<{
  certificates: ActiveCertificatesByPurpose
  onDelete: (purpose: CertificatePurpose) => Promise<void>
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
  passwordInvalid: boolean
  passwordVisible: boolean
  onPickFile: () => void
  onSelectFileName: (value: string) => void
  passwordInput: RefObject<HTMLInputElement | null>
  onTogglePasswordVisibility: () => void
}>

function isCertificatePurpose(value: string): value is CertificatePurpose {
  return CERTIFICATE_PURPOSES.some((purpose) => purpose === value)
}

function CertificatePurposeField(
  props: Readonly<{
    disabled: boolean
    purpose: CertificatePurpose
    onChange: (purpose: CertificatePurpose) => void
  }>,
) {
  const { t } = useTranslation('companySettings')
  return (
    <div className={styles.fieldGrid}>
      <label>
        <span>{t('certificatePurpose')}</span>
        <Select
          ariaLabel={t('certificatePurpose')}
          disabled={props.disabled}
          options={CERTIFICATE_PURPOSES.map((purpose) => ({
            label: t(CERTIFICATE_PURPOSE_LABEL_KEYS[purpose]),
            value: purpose,
          }))}
          value={props.purpose}
          onChange={(value) => {
            if (isCertificatePurpose(value)) props.onChange(value)
          }}
        />
      </label>
      <p className={styles.fieldHint}>{t('certificatePurposeHint')}</p>
    </div>
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
          <Icon name="upload" />
          <span>{t('chooseCertificateFile')}</span>
        </button>
        <span className={styles.fileUploadName}>
          {props.fileName ?? t('noCertificateFileSelected')}
        </span>
      </label>
      <label>
        <span>{t('certificatePassword')}</span>
        <div aria-invalid={props.passwordInvalid} className={styles.passwordRevealField}>
          <input
            aria-invalid={props.passwordInvalid}
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
            {props.passwordVisible ? <Icon name="eye-off" /> : <Icon name="eye" />}
          </button>
        </div>
      </label>
    </>
  )
}

export function CertificateUploadForm({
  certificates,
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
  const [purpose, setPurpose] = useState<CertificatePurpose>('cte')
  const certificate = certificates[purpose]
  const passwordInvalid =
    status.key === 'certificateErrorMissingFields' || status.key === 'certificateErrorInvalid'
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
      <CertificatePurposeField
        disabled={disabled}
        purpose={purpose}
        onChange={(next) => {
          controller.setPurpose(next)
          setPurpose(next)
          setConfirmDelete(false)
          setStatus({ key: 'idle' })
        }}
      />
      {certificate === undefined ? (
        <p className={styles.certificateMetadata}>{t('certificateMissingForPurpose')}</p>
      ) : (
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
        passwordInvalid={passwordInvalid}
        passwordVisible={passwordVisible}
        onPickFile={() => fileInput.current?.click()}
        onSelectFileName={setFileName}
        onTogglePasswordVisibility={() => setPasswordVisible((current) => !current)}
        passwordInput={passwordInput}
      />
      <button className={styles.primaryAction} disabled={disabled} type="button" onClick={submit}>
        <Icon name="shield" />
        {t(certificate === undefined ? 'registerCertificate' : 'replaceCertificate')}
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
              <Icon name="trash" />
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
                  <Icon name="close" />
                  {t('cancelRemoveCertificate')}
                </button>
                <button
                  className={styles.dangerAction}
                  disabled={disabled}
                  type="button"
                  onClick={() => {
                    void onDelete(purpose)
                      .then(() => {
                        setConfirmDelete(false)
                        setStatus({ key: 'deleted' })
                      })
                      .catch((error) => setStatus(resolveCertificateStatus(error)))
                  }}
                >
                  <Icon name="check" />
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
