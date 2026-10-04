/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Entrada da `worker_thread` da prévia (spec 237, segurança S1): a planilha é de terceiro e o parse
 * é síncrono — no processo principal, um arquivo hostil pararia todos os trilhos. Sem rede, sem
 * banco e sem log.
 */
import { parentPort, workerData } from 'node:worker_threads'

import type { PreviewReadingProfile } from '../application/cargo-preview-worker.port.js'
import { readCargoPreviewWorkbook } from '../application/read-cargo-preview-workbook.service.js'

type ThreadInput = { readonly bytes: Uint8Array; readonly profile: PreviewReadingProfile }

if (parentPort !== null) {
  const input = workerData as ThreadInput
  parentPort.postMessage(
    readCargoPreviewWorkbook({
      bytes: input.bytes,
      clock: () => performance.now(),
      profile: input.profile,
    }),
  )
}
