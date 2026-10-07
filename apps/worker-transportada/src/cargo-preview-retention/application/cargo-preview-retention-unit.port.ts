/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type CargoPreviewRetentionPreview = {
  readonly companyId: string
  readonly id: string
}

export type CargoPreviewRetentionObject = {
  readonly bucket: string
  readonly id: string
  readonly key: string
}

export type CargoPreviewRetentionRecord = {
  readonly itemsAnonymized: number
  readonly objectsDeleted: number
  readonly occurredAt: Date
}

/**
 * O acesso ao banco por trás da unidade de trabalho — separado do Drizzle para a ordem (bytes antes
 * do banco, evento só no fim) ser testável com portas falsas.
 */
export type CargoPreviewRetentionGateway = {
  /**
   * Trava a prévia (`for update skip locked`) e reconfere dentro da transação: terminal, sem item em
   * aberto e sem o evento de retenção. Vazio = outro ciclo a tratou ou travou.
   */
  readonly lockEligiblePreview: (input: {
    readonly previewId: string
  }) => Promise<CargoPreviewRetentionPreview | undefined>
  /** A planilha e o MIME bruto da prévia ainda vivos, na ordem de `id`, travados, até `limit + 1`. */
  readonly lockLiveObjects: (input: {
    readonly limit: number
    readonly preview: CargoPreviewRetentionPreview
  }) => Promise<readonly CargoPreviewRetentionObject[]>
  readonly anonymizeItems: (preview: CargoPreviewRetentionPreview) => Promise<number>
  /** `status` e `deleted_at` no mesmo `UPDATE` — o CHECK do banco é uma equivalência. */
  readonly markObjectsDeleted: (ids: readonly string[]) => Promise<void>
  readonly recordRetention: (input: {
    readonly preview: CargoPreviewRetentionPreview
    readonly record: CargoPreviewRetentionRecord
  }) => Promise<void>
  readonly runInTransaction: <TResult>(
    work: (gateway: CargoPreviewRetentionGateway) => Promise<TResult>,
  ) => Promise<TResult>
}

export type DeleteStoredObjectBytes = (input: {
  readonly bucket: string
  readonly key: string
}) => Promise<void>
