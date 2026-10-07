/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4: o envio da planilha de prévia — a validação do arquivo no cliente (extensão e o teto de
 * 960 KiB do servidor), o contratante obrigatório, todos os problemas de uma vez, e o `Idempotency-Key`
 * estável por tentativa. O servidor confere os bytes; aqui só se falha cedo, com mensagem clara.
 */
import { describe, expect, test } from 'bun:test'

import { CARGO_PREVIEW_LIMITS } from '@/modules/cargo-receiving/shared/cargoPreview.constant'
import {
  buildPreviewUploadFingerprint,
  validatePreviewUpload,
} from '@/modules/cargo-receiving/shared/cargoPreviewUpload.validation'
import { resolveIdempotencyAttempt } from '@/modules/cargo-receiving/shared/cargoIdempotencyKey.service'

import { ALFA_ID, BETA_ID } from '../fixtures/cargoReceiving.fixture'

function sheet(input: { bytes?: number; lastModified?: number; name?: string }): File {
  return new File([new Uint8Array(input.bytes ?? 1_000)], input.name ?? 'FR-05-10.xlsm', {
    lastModified: input.lastModified ?? 1_759_500_000_000,
  })
}

describe('o teto do arquivo (spec 237 T4.4)', () => {
  test('o teto é o do servidor: 960 KiB, não os 5 MiB do leitor', () => {
    expect(CARGO_PREVIEW_LIMITS.fileMaxBytes).toBe(983_040)
  })

  test('960 KiB exatos passam; um byte a mais é recusado dizendo o limite em KB', () => {
    const limit = CARGO_PREVIEW_LIMITS.fileMaxBytes

    expect(validatePreviewUpload({ contractorId: ALFA_ID, file: sheet({ bytes: limit }) })).toEqual(
      {},
    )
    expect(
      validatePreviewUpload({ contractorId: ALFA_ID, file: sheet({ bytes: limit + 1 }) }),
    ).toEqual({ file: { code: 'tooLarge', max: 960 } })
  })

  test('arquivo vazio é recusado: o servidor não tem o que ler', () => {
    expect(validatePreviewUpload({ contractorId: ALFA_ID, file: sheet({ bytes: 0 }) })).toEqual({
      file: { code: 'empty' },
    })
  })
})

describe('a extensão e os campos obrigatórios', () => {
  test('aceita .xlsx e .xlsm em qualquer caixa e recusa o resto', () => {
    const accepted = ['a.xlsx', 'a.xlsm', 'A.XLSX', 'Prévia.Xlsm']
    for (const name of accepted) {
      expect(validatePreviewUpload({ contractorId: ALFA_ID, file: sheet({ name }) })).toEqual({})
    }
    for (const name of ['a.xls', 'a.csv', 'a.xlsx.exe', 'a', 'a.pdf']) {
      expect(validatePreviewUpload({ contractorId: ALFA_ID, file: sheet({ name }) })).toEqual({
        file: { code: 'extension' },
      })
    }
  })

  test('contratante e arquivo são obrigatórios, e os dois problemas saem juntos', () => {
    expect(validatePreviewUpload({ contractorId: '', file: undefined })).toEqual({
      contractorId: { code: 'required' },
      file: { code: 'required' },
    })
  })

  test('com contratante e arquivo válidos não há problema algum', () => {
    expect(validatePreviewUpload({ contractorId: BETA_ID, file: sheet({}) })).toEqual({})
  })
})

describe('o Idempotency-Key por tentativa do envio', () => {
  const generated: string[] = []
  const generateKey = () => {
    generated.push(`chave-${String(generated.length + 1).padStart(16, '0')}`)
    return generated.at(-1) ?? ''
  }

  test('o mesmo contratante e o mesmo arquivo têm a mesma impressão, venham de onde vierem', () => {
    const first = buildPreviewUploadFingerprint({ contractorId: ALFA_ID, file: sheet({}) })
    const again = buildPreviewUploadFingerprint({ contractorId: ALFA_ID, file: sheet({}) })

    expect(again).toBe(first)
  })

  test('outro contratante, nome, tamanho ou data do arquivo muda a impressão', () => {
    const base = buildPreviewUploadFingerprint({ contractorId: ALFA_ID, file: sheet({}) })
    const others = [
      buildPreviewUploadFingerprint({ contractorId: BETA_ID, file: sheet({}) }),
      buildPreviewUploadFingerprint({ contractorId: ALFA_ID, file: sheet({ name: 'outra.xlsx' }) }),
      buildPreviewUploadFingerprint({ contractorId: ALFA_ID, file: sheet({ bytes: 2_000 }) }),
      buildPreviewUploadFingerprint({
        contractorId: ALFA_ID,
        file: sheet({ lastModified: 1_759_600_000_000 }),
      }),
    ]

    for (const other of others) expect(other).not.toBe(base)
  })

  test('repetir o mesmo envio reaproveita a chave; mudar o arquivo gera chave nova', () => {
    const fingerprint = buildPreviewUploadFingerprint({ contractorId: ALFA_ID, file: sheet({}) })
    const first = resolveIdempotencyAttempt({ fingerprint, generateKey, previous: undefined })
    const retry = resolveIdempotencyAttempt({ fingerprint, generateKey, previous: first })
    const changed = resolveIdempotencyAttempt({
      fingerprint: buildPreviewUploadFingerprint({
        contractorId: ALFA_ID,
        file: sheet({ name: 'outra.xlsx' }),
      }),
      generateKey,
      previous: first,
    })

    expect(retry.key).toBe(first.key)
    expect(changed.key).not.toBe(first.key)
    expect(first.key).toMatch(/^[A-Za-z0-9._:-]{16,256}$/u)
  })
})
