/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverRouteOccurrenceDetail,
  RouteOccurrenceFile,
  RouteOccurrenceKind,
} from './driverRouteOccurrence.types'
import {
  readOccurrenceFileUrl,
  shareDriverFiles,
  type DriverFileShareOutcome,
  type DriverShareableFile,
} from './driverFileShare.service'
import { getDriverTripClient } from './driverTripClient.service'

export type RouteOccurrenceDocumentOrigin = 'attachment' | 'photo' | 'signature'

export type RouteOccurrenceDocument = DriverShareableFile &
  Readonly<{ origin: RouteOccurrenceDocumentOrigin; sizeBytes: number | null }>

const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function resolveFileName(input: {
  readonly file: RouteOccurrenceFile
  readonly origin: RouteOccurrenceDocumentOrigin
  readonly position: number
}): string {
  const { file } = input
  if (file.name !== null && file.name !== '') return file.name
  const extension =
    file.contentType === null ? undefined : EXTENSION_BY_CONTENT_TYPE[file.contentType]
  const base = `${input.origin}-${input.position}`
  return extension === undefined ? base : `${base}.${extension}`
}

/** Spec 266 RF6: as fotos e a assinatura do motorista mais os anexos do chat, sem repetir o mesmo objeto. */
export function listRouteOccurrenceDocuments(
  detail: Pick<DriverRouteOccurrenceDetail, 'attachments' | 'photos' | 'signature'>,
): readonly RouteOccurrenceDocument[] {
  const candidates: readonly (readonly [RouteOccurrenceDocumentOrigin, RouteOccurrenceFile])[] = [
    ...detail.photos.map((file) => ['photo', file] as const),
    ...(detail.signature === null ? [] : [['signature', detail.signature] as const]),
    ...detail.attachments.map((file) => ['attachment', file] as const),
  ]
  const seen = new Set<string>()
  const documents: RouteOccurrenceDocument[] = []
  for (const [origin, file] of candidates) {
    if (seen.has(file.objectId)) continue
    seen.add(file.objectId)
    documents.push({
      contentType: file.contentType,
      fileName: resolveFileName({ file, origin, position: documents.length + 1 }),
      objectId: file.objectId,
      origin,
      sizeBytes: file.sizeBytes,
    })
  }
  return documents
}

export type ShareRouteOccurrenceDocumentsParams = Readonly<{
  documents: readonly RouteOccurrenceDocument[]
  id: string
  kind: RouteOccurrenceKind
  title: string
}>

export function shareRouteOccurrenceDocuments(
  params: ShareRouteOccurrenceDocumentsParams,
): Promise<DriverFileShareOutcome> {
  return shareDriverFiles({
    files: params.documents,
    readUrl: (objectId) => readOccurrenceFileUrl({ id: params.id, kind: params.kind, objectId }),
    title: params.title,
  })
}

/** O botão da linha da lista não tem o detalhe na mão: lê na hora do toque. `unavailable`: viagem encerrada ou ocorrência sumida. */
export async function shareRouteOccurrenceDocumentsById(
  params: Readonly<{ id: string; kind: RouteOccurrenceKind; title: string }>,
): Promise<DriverFileShareOutcome | 'unavailable'> {
  const result = await getDriverTripClient().readRouteOccurrence({
    id: params.id,
    kind: params.kind,
  })
  if (result.status !== 'loaded') return 'unavailable'
  return shareRouteOccurrenceDocuments({
    documents: listRouteOccurrenceDocuments(result.data),
    id: params.id,
    kind: params.kind,
    title: params.title,
  })
}
