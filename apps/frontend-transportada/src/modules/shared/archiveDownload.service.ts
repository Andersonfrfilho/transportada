export type ArchiveFile = Readonly<{
  blob: Blob
  fileName: string
}>

/** O ZIP chega como blob: sem âncora temporária o navegador abriria binário na aba. */
export function saveArchiveFile(file: ArchiveFile): void {
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
