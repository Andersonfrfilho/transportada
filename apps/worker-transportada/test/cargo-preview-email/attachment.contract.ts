/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (RF4): o anexo da prévia por e-mail obedece ao MESMO teto e ao MESMO critério de tipo
 * do upload — 960 KiB e `PK\x03\x04` nos bytes, nunca a extensão nem o `Content-Type`. Exatamente um
 * anexo candidato; o resto do e-mail nunca é lido.
 */
import { describe, expect, test } from 'bun:test'

import { selectPreviewWorkbook } from '../../src/cargo-preview-email/domain/preview-email-attachment.policy.js'
import { CARGO_PREVIEW_OBJECT_MAX_BYTES } from '../../src/cargo-preview/domain/cargo-preview-object.policy.js'
import { WORKBOOK_BYTES } from './mime.fixture.js'

const attachment = (
  overrides: Partial<Parameters<typeof selectPreviewWorkbook>[0][number]> = {},
) => ({
  bytes: WORKBOOK_BYTES,
  disposition: 'attachment',
  fileName: 'FR-06-10.xlsm',
  mimeType: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  ...overrides,
})

describe('o anexo da prévia por e-mail (spec 237 T4.6)', () => {
  test('um anexo zip é a planilha, com o nome do arquivo', () => {
    expect(selectPreviewWorkbook([attachment()])).toEqual({
      bytes: WORKBOOK_BYTES,
      fileName: 'FR-06-10.xlsm',
      kind: 'found',
    })
  })

  test('o tipo vem dos bytes: extensão de planilha com outros bytes é recusada', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])
    expect(selectPreviewWorkbook([attachment({ bytes: pdf })])).toEqual({
      code: 'ATTACHMENT_NOT_A_WORKBOOK',
      kind: 'rejected',
    })
  })

  test('o tipo vem dos bytes: bytes de zip com outra extensão e outro Content-Type passam', () => {
    const result = selectPreviewWorkbook([
      attachment({ fileName: 'a.bin', mimeType: 'text/plain' }),
    ])
    expect(result.kind).toBe('found')
  })

  test('o teto é o do upload: o limite passa, um byte a mais é recusado', () => {
    const atLimit = new Uint8Array(CARGO_PREVIEW_OBJECT_MAX_BYTES).fill(1)
    atLimit.set([0x50, 0x4b, 0x03, 0x04])
    expect(selectPreviewWorkbook([attachment({ bytes: atLimit })]).kind).toBe('found')
    const over = new Uint8Array(CARGO_PREVIEW_OBJECT_MAX_BYTES + 1)
    over.set([0x50, 0x4b, 0x03, 0x04])
    expect(selectPreviewWorkbook([attachment({ bytes: over })])).toEqual({
      code: 'ATTACHMENT_TOO_LARGE',
      kind: 'rejected',
    })
  })

  test('sem anexo, ou só com a parte inline, é ausente', () => {
    expect(selectPreviewWorkbook([])).toEqual({ code: 'ATTACHMENT_MISSING', kind: 'rejected' })
    expect(selectPreviewWorkbook([attachment({ disposition: 'inline' })])).toEqual({
      code: 'ATTACHMENT_MISSING',
      kind: 'rejected',
    })
  })

  test('mais de um anexo é ambíguo, mesmo que só um seja planilha', () => {
    expect(
      selectPreviewWorkbook([
        attachment(),
        attachment({ bytes: new Uint8Array([1, 2, 3, 4]), fileName: 'logo.png' }),
      ]),
    ).toEqual({ code: 'ATTACHMENT_AMBIGUOUS', kind: 'rejected' })
  })

  test('a mensagem anexada não conta como candidata', () => {
    const forwarded = attachment({ fileName: 'fwd.eml', mimeType: 'message/rfc822' })
    expect(selectPreviewWorkbook([forwarded, attachment()]).kind).toBe('found')
  })

  test('o nome sai sem caminho nem controle, e vazio vira o nome padrão', () => {
    const named = selectPreviewWorkbook([attachment({ fileName: 'C:\\x\\..\\FR\u0000-06.xlsm' })])
    expect(named).toMatchObject({ fileName: 'FR-06.xlsm', kind: 'found' })
    expect(selectPreviewWorkbook([attachment({ fileName: null })])).toMatchObject({
      fileName: 'previa.xlsx',
    })
  })
})
