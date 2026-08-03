/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CertificatePurpose, SafeCertificate } from '../shared/companySettingsClient.service'

export type CertificateUploadController = Readonly<{
  readonly hasSensitiveDraft: boolean
  selectCertificate: (file: File) => void
  setPassword: (password: string) => void
  setPurpose: (purpose: CertificatePurpose) => void
  submit: () => Promise<SafeCertificate>
}>

type CertificateUploadDependencies = Readonly<{
  clearFileInput: () => void
  clearPasswordInput: () => void
  replaceCertificate: (body: FormData) => Promise<SafeCertificate>
}>

function clearFormData(formData: FormData): void {
  for (const key of [...formData.keys()]) formData.delete(key)
}

function buildCertificateFormData(
  input: Readonly<{ file: File; password: string; purpose: CertificatePurpose }>,
): FormData {
  const body = new FormData()
  body.set('certificate', input.file)
  body.set('password', input.password)
  body.set('purpose', input.purpose)
  return body
}

function clearSensitiveDraft(
  input: Readonly<{
    clearFileInput: () => void
    clearPasswordInput: () => void
  }>,
): void {
  try {
    input.clearFileInput()
  } catch {
    // DOM cleanup is best effort after the in-memory references are cleared.
  }
  try {
    input.clearPasswordInput()
  } catch {
    // DOM cleanup is best effort after the in-memory references are cleared.
  }
}

export function createCertificateUploadController(
  dependencies: CertificateUploadDependencies,
): CertificateUploadController {
  let file: File | undefined
  let password = ''
  let purpose: CertificatePurpose = 'cte'
  const clear = () => {
    file = undefined
    password = ''
    clearSensitiveDraft(dependencies)
  }
  return {
    get hasSensitiveDraft() {
      return file !== undefined || password !== ''
    },
    selectCertificate: (selectedFile) => {
      file = selectedFile
    },
    setPassword: (value) => {
      password = value
    },
    setPurpose: (value) => {
      purpose = value
    },
    async submit() {
      if (file === undefined || password === '') {
        clear()
        throw new Error('CERTIFICATE_UPLOAD_REQUIRED')
      }
      let body: FormData | undefined
      try {
        body = buildCertificateFormData({ file, password, purpose })
        return await dependencies.replaceCertificate(body)
      } catch (error) {
        throw new Error(toSafeUploadErrorCode(error))
      } finally {
        if (body !== undefined) clearFormData(body)
        clear()
      }
    },
  }
}

function toSafeUploadErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{0,100}$/.test(message) ? message : 'CERTIFICATE_UPLOAD_FAILED'
}
