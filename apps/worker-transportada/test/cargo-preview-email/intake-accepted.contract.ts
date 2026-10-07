/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6, CA1: e-mail encaminhado por quem está na lista, com DKIM do encaminhador alinhado,
 * remetente original permitido e uma planilha — vira prévia pelo MESMO contrato do upload.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import { PREVIEW_EMAIL_MAX_RAW_BYTES } from '../../src/cargo-preview-email/domain/cargo-preview-email.constant.js'
import { WORKBOOK_BYTES } from './mime.fixture.js'
import {
  COMPANY_ID,
  CONTRACTOR_ID,
  FILE_OBJECT_ID,
  PROVIDER_EMAIL_ID,
  runIntake,
} from './intake.harness.js'

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

describe('a prévia por e-mail encaminhado aceita (spec 237 T4.6, CA1)', () => {
  test('grava a prévia com o arquivo, o MIME bruto e a identidade do e-mail', async () => {
    const { calls, raw, result } = runIntake()

    expect(await result).toEqual({
      contractorId: CONTRACTOR_ID,
      dkimResult: 'aligned',
      isReplay: false,
      kind: 'accepted',
      previewId: 'preview-1',
    })
    expect(calls.created).toHaveLength(1)
    const record = calls.created[0]
    const fileSha256 = sha256(WORKBOOK_BYTES)
    expect(record).toMatchObject({
      companyId: COMPANY_ID,
      contractorId: CONTRACTOR_ID,
      correlationId: 'corr-0001',
      dkimResult: 'aligned',
      file: {
        bucket: 'transportada-private',
        fileName: 'FR-06-10.xlsm',
        fileObjectId: FILE_OBJECT_ID,
        idempotencyKey: `email:${sha256(PROVIDER_EMAIL_ID)}`,
        objectKey: `tenants/${COMPANY_ID}/cargo-previews/${FILE_OBJECT_ID}`,
        requestFingerprint: sha256(JSON.stringify([CONTRACTOR_ID, fileSha256])),
        sha256: fileSha256,
        sizeBytes: WORKBOOK_BYTES.byteLength,
      },
      providerEmailId: PROVIDER_EMAIL_ID,
      raw: {
        bucket: 'transportada-private',
        key: `tenants/${COMPANY_ID}/contractor-mail/${PROVIDER_EMAIL_ID}/raw.eml`,
        mimeType: 'message/rfc822',
        provider: 'minio',
        sha256: sha256(raw),
        sizeBytes: raw.byteLength,
      },
    })
    expect(record?.receivedAt.toISOString()).toBe('2026-10-06T14:59:00.000Z')
  })

  test('baixa o e-mail com o teto do ramo, sem passar dos 25 MiB do provedor', async () => {
    const { calls, result } = runIntake()
    await result
    expect(calls.downloads).toEqual([{ maxBytes: PREVIEW_EMAIL_MAX_RAW_BYTES }])
  })

  test('guarda no bucket só a planilha e o MIME, com chave opaca e sem endereço', async () => {
    const { calls, result } = runIntake()
    await result
    expect(calls.stored.map((item) => item.key).sort()).toEqual([
      `tenants/${COMPANY_ID}/cargo-previews/${FILE_OBJECT_ID}`,
      `tenants/${COMPANY_ID}/contractor-mail/${PROVIDER_EMAIL_ID}/raw.eml`,
    ])
    const file = calls.stored.find((item) => item.key.includes('cargo-previews'))
    expect(Array.from(file?.body ?? [])).toEqual(Array.from(WORKBOOK_BYTES))
    for (const item of calls.stored) expect(item.key).not.toContain('@')
    expect(calls.deleted).toEqual([])
  })

  test('o mesmo arquivo do contratante devolve a prévia que já existe e não guarda arquivo novo', async () => {
    const { calls, result } = runIntake({
      createOutcome: { kind: 'replayed', previewId: 'preview-0' },
    })
    expect(await result).toMatchObject({ isReplay: true, kind: 'accepted', previewId: 'preview-0' })
    expect(calls.deleted).toEqual([`tenants/${COMPANY_ID}/cargo-previews/${FILE_OBJECT_ID}`])
  })

  test('reprocessar a mesma mensagem não cria prévia e não deixa objeto para trás', async () => {
    const { calls, result } = runIntake({ createOutcome: { kind: 'already_recorded' } })
    expect(await result).toEqual({ kind: 'already_recorded' })
    expect(calls.deleted.sort()).toEqual([
      `tenants/${COMPANY_ID}/cargo-previews/${FILE_OBJECT_ID}`,
      `tenants/${COMPANY_ID}/contractor-mail/${PROVIDER_EMAIL_ID}/raw.eml`,
    ])
  })

  test('falha ao gravar a prévia apaga o que foi ao bucket e propaga o erro', async () => {
    const { calls, result } = runIntake({
      createOutcome: () => {
        throw new Error('banco caiu')
      },
    })
    await expect(result).rejects.toThrow('banco caiu')
    expect(calls.deleted).toHaveLength(2)
  })

  test('falha no bucket propaga (a fila repete) e não grava prévia', async () => {
    const { calls, result } = runIntake({ storeFails: true })
    await expect(result).rejects.toThrow('bucket indisponível')
    expect(calls.created).toEqual([])
  })

  test('o resultado não carrega endereço, nome, assunto nem corpo', async () => {
    const { result } = runIntake()
    const serialized = JSON.stringify(await result)
    for (const sensitive of ['@', 'Equipe', 'transportadora', 'contratante', 'segue', 'Fwd']) {
      expect(serialized).not.toContain(sensitive)
    }
  })
})
