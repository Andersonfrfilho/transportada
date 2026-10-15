/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RouteOccurrenceKind } from './driverRouteOccurrence.types'
import { saveDriverFile } from './driverFileSave.service'
import { getDriverTripClient } from './driverTripClient.service'

export type DriverFileShareReason = 'fetch' | 'share' | 'url'

/** O arquivo não pôde ser lido ou entregue: quem chama mostra o aviso; cancelar a folha de compartilhar não cai aqui. */
export class DriverFileShareError extends Error {
  readonly reason: DriverFileShareReason

  constructor(reason: DriverFileShareReason, options?: ErrorOptions) {
    super(`driver file share failed: ${reason}`, options)
    this.name = 'DriverFileShareError'
    this.reason = reason
  }
}

export type DriverShareableFile = Readonly<{
  contentType: string | null
  fileName: string
  objectId: string
}>

export type DriverFileShareDependencies = Readonly<{
  fetch: (url: string) => Promise<Response>
  navigator: Readonly<{
    canShare?: (data: ShareData) => boolean
    share: (data: ShareData) => Promise<void>
  }>
  save: (file: Readonly<{ blob: Blob; fileName: string }>) => void
}>

export type ShareDriverFilesParams = Readonly<{
  dependencies?: DriverFileShareDependencies
  files: readonly DriverShareableFile[]
  /** Pede o link assinado de 5 min na hora do toque; nunca é guardado. */
  readUrl: (objectId: string) => Promise<string>
  title: string
}>

export type DriverFileShareOutcome = 'cancelled' | 'downloaded' | 'shared'

function buildDefaultDependencies(): DriverFileShareDependencies {
  return {
    fetch: (url) => fetch(url),
    navigator,
    save: saveDriverFile,
  }
}

async function downloadFile(input: {
  readonly dependencies: DriverFileShareDependencies
  readonly file: DriverShareableFile
  readonly readUrl: (objectId: string) => Promise<string>
}): Promise<File> {
  const { file } = input
  const url = await input.readUrl(file.objectId).catch((cause: unknown) => {
    throw new DriverFileShareError('url', { cause })
  })
  const response = await input.dependencies.fetch(url).catch((cause: unknown) => {
    throw new DriverFileShareError('fetch', { cause })
  })
  if (!response.ok) throw new DriverFileShareError('fetch')
  const blob = await response.blob().catch((cause: unknown) => {
    throw new DriverFileShareError('fetch', { cause })
  })
  return new File([blob], file.fileName, { type: file.contentType ?? blob.type })
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Spec 266 RF9b: a folha de compartilhar do aparelho quando ela aceita arquivos; senão o download.
 * Fechar a folha sem escolher ninguém é `cancelled`, não erro.
 */
export async function shareDriverFiles(
  params: ShareDriverFilesParams,
): Promise<DriverFileShareOutcome> {
  const dependencies = params.dependencies ?? buildDefaultDependencies()
  const files = await Promise.all(
    params.files.map((file) => downloadFile({ dependencies, file, readUrl: params.readUrl })),
  )
  const data: ShareData = { files, title: params.title }
  if (dependencies.navigator.canShare?.(data) !== true) {
    for (const file of files) dependencies.save({ blob: file, fileName: file.name })
    return 'downloaded'
  }
  try {
    await dependencies.navigator.share(data)
    return 'shared'
  } catch (cause) {
    if (isAbortError(cause)) return 'cancelled'
    throw new DriverFileShareError('share', { cause })
  }
}

/** O visualizador de PDF do navegador vive na aba nova: a CSP tem `frame-src 'none'`, então nada de iframe. */
export function openDriverFileInNewTab(input: {
  readonly open?: (url: string, target: string, features: string) => unknown
  readonly url: string
}): void {
  const open = input.open ?? ((...args: [string, string, string]) => window.open(...args))
  open(input.url, '_blank', 'noopener')
}

/** O link assinado de um arquivo da ocorrência; viagem encerrada e arquivo ausente viram erro tipado. */
export async function readOccurrenceFileUrl(input: {
  readonly id: string
  readonly kind: RouteOccurrenceKind
  readonly objectId: string
}): Promise<string> {
  const result = await getDriverTripClient().readRouteOccurrenceFileUrl(input)
  if (result.status !== 'loaded') throw new DriverFileShareError('url')
  return result.data
}
