/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteItemExportFile } from './cteBatchItemClient.service'

/** O ZIP chega como blob: sem âncora temporária o navegador abriria binário na aba. */
export function saveCteArchive(file: CteItemExportFile): void {
  if (typeof document === 'undefined') return
  const objectUrl = URL.createObjectURL(file.blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = file.fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}
