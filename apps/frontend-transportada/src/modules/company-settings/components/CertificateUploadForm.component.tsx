/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type RefObject, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  createCertificateUploadController,
  type CertificateUploadController,
} from '../hooks/useCertificateUpload.hook'
import styles from '../styles/companySettings.module.css'

type CertificateUploadFormProps = Readonly<{
  disabled: boolean
  onSubmit: (body: FormData) => Promise<unknown>
}>

type CertificateInputsProps = Readonly<{
  controller: CertificateUploadController
  disabled: boolean
  fileInput: RefObject<HTMLInputElement | null>
  passwordInput: RefObject<HTMLInputElement | null>
}>

function CertificateInputs(props: CertificateInputsProps) {
  const { t } = useTranslation('companySettings')
  return (
    <>
      <label>
        <span>{t('certificateFile')}</span>
        <input
          accept=".pfx,application/x-pkcs12"
          disabled={props.disabled}
          ref={props.fileInput}
          type="file"
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? [])
            if (file !== undefined) props.controller.selectCertificate(file)
          }}
        />
      </label>
      <label>
        <span>{t('certificatePassword')}</span>
        <input
          autoComplete="new-password"
          disabled={props.disabled}
          ref={props.passwordInput}
          type="password"
          onChange={(event) => props.controller.setPassword(event.target.value)}
        />
      </label>
    </>
  )
}

export function CertificateUploadForm({ disabled, onSubmit }: CertificateUploadFormProps) {
  const { t } = useTranslation('companySettings')
  const fileInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const submitRef = useRef(onSubmit)
  submitRef.current = onSubmit
  const [status, setStatus] = useState<'error' | 'idle' | 'success'>('idle')
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
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }
  return (
    <section className={styles.certificateForm} aria-labelledby="certificate-title">
      <h2 id="certificate-title">{t('certificateTitle')}</h2>
      <CertificateInputs
        controller={controller}
        disabled={disabled}
        fileInput={fileInput}
        passwordInput={passwordInput}
      />
      <button className={styles.primaryAction} disabled={disabled} type="button" onClick={submit}>
        {t('replaceCertificate')}
      </button>
      {status !== 'idle' && <p role="status">{t(status)}</p>}
    </section>
  )
}
