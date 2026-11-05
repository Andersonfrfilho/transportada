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

/** Só o que a ficha do motorista sabe receber. A leitura guarda mais (o nome), e isso não sai. */
export type FleetDriverAttachmentSuggestionFields = Readonly<{
  licenseCategory: string | null
  licenseNumber: string | null
}>

export type FleetDriverAttachmentSuggestionRead = Readonly<{
  /** `null` quando não houve leitura, nada foi reconhecido ou o operador já decidiu. */
  fields: FleetDriverAttachmentSuggestionFields | null
  isFound: boolean
}>

export type FleetDriverAttachmentLocation = Readonly<{
  bucket: string
  objectKey: string
  storedObjectId: string
  type: FleetDriverAttachmentType
}>

export type FleetDriverAttachmentAuditAction = 'attached' | 'removed' | 'replaced' | 'revealed'

/** Ator, alvo, IP e instante — nunca o conteúdo do documento (`security.md` §10). */
export type FleetDriverAttachmentAuditInput = Readonly<{
  action: FleetDriverAttachmentAuditAction
  actorUserId: string
  attachmentId: string
  clientIp: string
  companyId: string
  correlationId: string
  driverId: string
  type: FleetDriverAttachmentType
}>

export type FleetDriverAttachmentAuditPort = Readonly<{
  record: (input: FleetDriverAttachmentAuditInput) => Promise<void>
}>

export type CreateFleetDriverAttachmentInput = Readonly<{
  /** O documento do mesmo tipo que esta troca substitui: sai na mesma transação em que o novo entra. */
  replaceAttachmentId?: string
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
  /** O documento vivo deste tipo, se houver — é o que uma troca substitui. */
  findByType: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly type: FleetDriverAttachmentType
  }) => Promise<Readonly<{ id: string; location: FleetDriverAttachmentLocation }> | null>
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
  readSuggestion: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly driverId: string
  }) => Promise<FleetDriverAttachmentSuggestionRead>
  /**
   * Tira de uma vez linhas, outbox e marca dos objetos de todos os documentos do motorista, numa transação,
   * e devolve onde estavam os arquivos para o chamador apagá-los depois do commit.
   */
  removeAllForDriver: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly FleetDriverAttachmentLocation[]>
  /** Tira a linha e marca o objeto como apagado, juntos. */
  remove: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly driverId: string
  }) => Promise<boolean>
}>

export type FleetDriverAttachmentStoragePort = Readonly<{
  headObject: (input: { readonly bucket: string; readonly key: string }) => Promise<unknown>
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
