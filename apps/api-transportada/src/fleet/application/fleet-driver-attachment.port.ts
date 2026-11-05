/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetDriverAttachmentDecision,
  FleetDriverAttachmentType,
} from '../../database/fleet-driver-attachment.schema.js'

export type FleetDriverAttachment = Readonly<{
  createdAt: string
  id: string
  type: FleetDriverAttachmentType
  uploadedBy: string
}>

/** O que a ficha mostra sob `fleet.read`: que o documento existe, de que tipo, quando e de quem. Sem conteúdo. */
export type FleetDriverAttachmentListItem = Readonly<{
  createdAt: string
  /** Há leitura da CNH ainda por decidir. É só o aviso: o que foi lido não sai por esta lista. */
  hasSuggestion: boolean
  id: string
  type: FleetDriverAttachmentType
  uploadedBy: Readonly<{ id: string; name: string | null }>
}>

export type FleetDriverAttachmentLocation = Readonly<{
  bucket: string
  objectKey: string
  storedObjectId: string
}>

export type CreateFleetDriverAttachmentInput = Readonly<{
  bucket: string
  companyId: string
  /** Viaja para o pedido de leitura: é por ele que o rastro do upload alcança o worker. */
  correlationId: string
  driverId: string
  mimeType: string
  objectKey: string
  provider: string
  sha256: string
  sizeBytes: number
  storedObjectId: string
  type: FleetDriverAttachmentType
  uploadedBy: string
}>

export type FleetDriverAttachmentRepositoryPort = Readonly<{
  /** Lança `FleetDriverNotFoundError` se o motorista não é desta empresa, e `...TypeTakenError` na corrida. */
  create: (input: CreateFleetDriverAttachmentInput) => Promise<FleetDriverAttachment>
  /**
   * Registra a decisão e **descarta** `extracted_fields` no mesmo `UPDATE` (D5): em duas escritas, uma
   * falha no meio deixaria o dado pessoal para trás no caminho de erro.
   */
  decideSuggestion: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly decidedBy: string
    readonly decision: FleetDriverAttachmentDecision
    readonly driverId: string
  }) => Promise<'already_decided' | 'decided' | 'not_found'>
  driverExists: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<boolean>
  /** Onde o arquivo mora, para quem precisa apagá-lo ou entregá-lo; `null` se não é deste motorista e empresa. */
  findLocation: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly driverId: string
  }) => Promise<FleetDriverAttachmentLocation | null>
  list: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly FleetDriverAttachmentListItem[]>
  /** Tira a linha e marca o objeto como apagado, juntos. */
  remove: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly driverId: string
  }) => Promise<boolean>
}>

export type FleetDriverAttachmentStoragePort = Readonly<{
  createSignedDownload: (input: {
    readonly bucket: string
    readonly expiresInSeconds: number
    readonly key: string
  }) => Promise<URL>
  deleteObject: (input: { readonly bucket: string; readonly key: string }) => Promise<void>
  storeObject: (input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }) => Promise<unknown>
}>
