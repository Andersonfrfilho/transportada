/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetDriverAttachmentType } from '../../database/fleet-driver-attachment.schema.js'

export type FleetDriverAttachment = Readonly<{
  createdAt: string
  id: string
  type: FleetDriverAttachmentType
  uploadedBy: string
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
