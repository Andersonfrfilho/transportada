/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: a planilha vira o plano dos itens com o leitor da parte A (cópia por valor da API).
 * É o mesmo código na thread (produção) e no processo (testes com dublê).
 */
import { parseCargoPreviewWorkbook } from '../../cargo-receiving/domain/cargo-preview-workbook.parser.js'
import { CargoPreviewWorkbookError } from '../../cargo-receiving/domain/cargo-preview-workbook.error.js'
import type { MonotonicClock } from '../../cargo-receiving/domain/cargo-preview-workbook.types.js'
import {
  CARGO_PREVIEW_FAILURE_CODES,
  type CargoPreviewFailureCode,
} from '../../shared/cargo-preview.constant.js'
import { planPreviewItems } from '../domain/cargo-preview-items.policy.js'
import type {
  CargoPreviewWorkbookReaderPort,
  PreviewReadingProfile,
  PreviewWorkbookReading,
} from './cargo-preview-worker.port.js'

function isFailureCode(code: string): code is CargoPreviewFailureCode {
  return (CARGO_PREVIEW_FAILURE_CODES as readonly string[]).includes(code)
}

/** O leitor só recusa com código estável; qualquer outro erro é nosso e sobe para a fila. */
export function readCargoPreviewWorkbook(input: {
  readonly bytes: Uint8Array
  readonly clock: MonotonicClock
  readonly profile: PreviewReadingProfile
}): PreviewWorkbookReading {
  try {
    const result = parseCargoPreviewWorkbook({
      bytes: input.bytes,
      clock: input.clock,
      columnMap: input.profile.columnMap,
      sheetName: input.profile.sheetName,
    })
    return { plan: planPreviewItems(result) }
  } catch (error) {
    if (error instanceof CargoPreviewWorkbookError && isFailureCode(error.code)) {
      return { code: error.code }
    }
    throw error
  }
}

/** Sem thread: só para os testes com dublê, onde o arquivo é conhecido. */
export function createInProcessCargoPreviewWorkbookReader(input: {
  readonly clock: MonotonicClock
}): CargoPreviewWorkbookReaderPort {
  return {
    read: async ({ bytes, profile }) =>
      readCargoPreviewWorkbook({ bytes, clock: input.clock, profile }),
  }
}
