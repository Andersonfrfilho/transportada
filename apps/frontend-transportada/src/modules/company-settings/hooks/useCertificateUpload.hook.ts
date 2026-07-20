/* Copyright (c) 2026 Ada Technology. MIT License. */
export type CertificateUploadController = Readonly<{
  readonly hasSensitiveDraft: boolean
  selectCertificate: (file: File) => void
  setPassword: (password: string) => void
  submit: () => Promise<void>
}>

type CertificateUploadDependencies = Readonly<{
  clearFileInput: () => void
  clearPasswordInput: () => void
  replaceCertificate: (body: FormData) => Promise<unknown>
}>

function clearFormData(formData: FormData): void {
  for (const key of [...formData.keys()]) formData.delete(key)
}

function buildCertificateFormData(input: Readonly<{ file: File; password: string }>): FormData {
  const body = new FormData()
  body.set('certificate', input.file)
  body.set('password', input.password)
  body.set('purpose', 'cte')
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
    async submit() {
      if (file === undefined || password === '') {
        clear()
        throw new Error('CERTIFICATE_UPLOAD_REQUIRED')
      }
      let body: FormData | undefined
      try {
        body = buildCertificateFormData({ file, password })
        await dependencies.replaceCertificate(body)
      } catch {
        throw new Error('CERTIFICATE_UPLOAD_FAILED')
      } finally {
        if (body !== undefined) clearFormData(body)
        clear()
      }
    },
  }
}
