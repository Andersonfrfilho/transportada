/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type OccurrenceAttachmentPurgeStoredObject = {
  readonly id: string
  readonly bucket: string
  readonly key: string
}

export type OccurrenceAttachmentPurgeAttachment = {
  readonly id: string
  readonly storedObjectId: string
  readonly thumbnailObjectId: string | null
}

/**
 * O acesso ao banco por trás da unidade de trabalho — separado do Drizzle de propósito, para o
 * algoritmo de ordem (ajuste 3/4) ser testável com portas falsas, sem Postgres.
 */
export type OccurrenceAttachmentPurgeGateway = {
  readonly findAttachmentByObjectId: (
    objectId: string,
  ) => Promise<OccurrenceAttachmentPurgeAttachment | undefined>
  /**
   * Trava, na ordem determinística de `id`, os `stored_objects` das ids dadas — `for update skip
   * locked` reconferindo `status <> 'deleted'`. Id ausente no resultado é lock perdido ou objeto já
   * apagado (ajuste 3).
   */
  readonly lockStoredObjects: (
    ids: readonly string[],
  ) => Promise<readonly OccurrenceAttachmentPurgeStoredObject[]>
  readonly deleteAttachment: (attachmentId: string) => Promise<void>
  /** `status` e `deleted_at` no mesmo `UPDATE` — o CHECK do banco é uma equivalência (ajuste 3). */
  readonly markObjectsDeleted: (ids: readonly string[]) => Promise<void>
  /** A transação é da **unidade**, nunca do lote — a falha de uma não desfaz as anteriores. */
  readonly runInTransaction: <TResult>(
    work: (gateway: OccurrenceAttachmentPurgeGateway) => Promise<TResult>,
  ) => Promise<TResult>
}

export type DeleteStoredObjectBytes = (input: {
  readonly bucket: string
  readonly key: string
}) => Promise<void>
