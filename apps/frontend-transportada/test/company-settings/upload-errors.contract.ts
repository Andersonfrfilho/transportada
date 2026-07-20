/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import { loadFutureModule, syntheticCertificateFile } from './company-settings.fixture'

describe('certificate upload incomplete draft contract', () => {
  test('clears a selected PFX when submit has no password', async () => {
    const module = await loadFutureModule<CertificateUploadModule>(
      '../../src/modules/company-settings/hooks/useCertificateUpload.hook',
    )
    const clearFileInput = mock(() => undefined)
    const clearPasswordInput = mock(() => undefined)
    const replaceCertificate = mock(() => Promise.resolve())
    const controller = module.createCertificateUploadController({
      clearFileInput,
      clearPasswordInput,
      replaceCertificate,
    })

    controller.selectCertificate(syntheticCertificateFile())
    const error = await controller.submit().catch((caught: unknown) => caught)

    expect(error).toEqual(expect.objectContaining({ message: 'CERTIFICATE_UPLOAD_REQUIRED' }))
    expect(clearFileInput).toHaveBeenCalledTimes(1)
    expect(clearPasswordInput).toHaveBeenCalledTimes(1)
    expect(replaceCertificate).not.toHaveBeenCalled()
    expect(controller.hasSensitiveDraft).toBe(false)
  })
})

type CertificateUploadModule = {
  readonly createCertificateUploadController: (input: {
    readonly clearFileInput: () => void
    readonly clearPasswordInput: () => void
    readonly replaceCertificate: (body: FormData) => Promise<void>
  }) => {
    readonly hasSensitiveDraft: boolean
    readonly selectCertificate: (file: File) => void
    readonly submit: () => Promise<void>
  }
}
