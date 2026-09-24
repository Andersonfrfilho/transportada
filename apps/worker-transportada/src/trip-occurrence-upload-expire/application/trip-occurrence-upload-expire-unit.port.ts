/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type PendingOccurrenceUpload = {
  readonly id: string
  readonly bucket: string
  readonly key: string
}

/**
 * O acesso ao banco por trás da unidade de trabalho — separado do Drizzle de propósito, para a
 * unidade ser testável com portas falsas, sem Postgres (mesmo desenho de
 * `trip-occurrence-attachment-purge-unit.port.ts`).
 */
export type TripOccurrenceUploadExpireGateway = {
  /**
   * `for update skip locked`, reconferindo `status = 'pending'` e `expires_at` vencido no momento do
   * lock — não na leitura que escolheu o candidato. Perde a corrida para um `confirm` concorrente
   * (que fecha `pending → confirmed` antes do lock) ou para outra execução desta mesma rotina;
   * `undefined` cobre os dois, e a unidade converge sem apagar nada.
   */
  readonly lockExpiredPendingUpload: (input: {
    readonly before: Date
    readonly id: string
  }) => Promise<PendingOccurrenceUpload | undefined>
  readonly markExpired: (id: string) => Promise<void>
  /** A transação é da **unidade**, nunca do lote — a falha de uma não desfaz o que as anteriores já apagaram. */
  readonly runInTransaction: <TResult>(
    work: (gateway: TripOccurrenceUploadExpireGateway) => Promise<TResult>,
  ) => Promise<TResult>
}

export type DeleteStoredObjectBytes = (input: {
  readonly bucket: string
  readonly key: string
}) => Promise<void>
