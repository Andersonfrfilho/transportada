/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4 (`web.md` §11): a recusa do servidor ao enviar a planilha nomeia TODOS os campos, com o
 * rótulo impresso e atalho — e fica em silêncio quando a falha não aponta campo algum. O campo que a tela
 * não conhece sai com o nome que a API usou.
 */
import { describe, expect, test } from 'bun:test'

import { describePreviewUploadRefusal } from '@/modules/cargo-receiving/shared/cargoPreviewRefusal.service'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

describe('a recusa do envio da prévia (spec 237 T4.4)', () => {
  test('lista TODOS os campos recusados, deduplicados, com o rótulo impresso', () => {
    const refusal = describePreviewUploadRefusal(
      new CargoReceivingRequestError('INVALID_REQUEST', [
        { field: 'contractorId', message: 'One contractor id is required' },
        { field: 'file', message: 'One file is required' },
        { field: 'file', message: 'Again' },
      ]),
    )

    expect(refusal.code).toBe('INVALID_REQUEST')
    expect(refusal.fields).toEqual([
      { field: 'contractorId', labelKey: 'preview.fields.contractorId' },
      { field: 'file', labelKey: 'preview.fields.file' },
    ])
    expect(refusal.documents).toEqual([])
  })

  test('falha sem campo nenhum não nomeia nada: a mensagem do código é que explica', () => {
    const refusal = describePreviewUploadRefusal(
      new CargoReceivingRequestError('PREVIEW_FILE_TOO_LARGE'),
    )

    expect(refusal.fields).toEqual([])
    expect(refusal.code).toBe('PREVIEW_FILE_TOO_LARGE')
  })

  test('o campo desconhecido sai com o nome que a API usou, sem rótulo', () => {
    const refusal = describePreviewUploadRefusal(
      new CargoReceivingRequestError('INVALID_REQUEST', [
        { field: 'Idempotency-Key', message: 'Use 16 to 256' },
        { field: 'file', message: 'One file is required' },
      ]),
    )

    expect(refusal.fields).toEqual([
      { field: 'Idempotency-Key', labelKey: undefined },
      { field: 'file', labelKey: 'preview.fields.file' },
    ])
  })

  test('um erro que não é do transporte (queda, bug) não nomeia campo algum', () => {
    expect(describePreviewUploadRefusal(new Error('boom'))).toEqual({
      code: undefined,
      documents: [],
      fields: [],
    })
  })
})
