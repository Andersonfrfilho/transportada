/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T302 — tudo o que a recarga grava acontece dentro de uma transação que começa pela trava
 * global do catálogo (RNF3). O caso de uso nunca vê a transação: recebe só as operações dela.
 */
import type { TollBoothExtractKey } from './toll-booth-extract.port.js'
import type { TollBoothRepository } from './toll-booth.port.js'

export type MarkTollBoothExtractReloadedInput = TollBoothExtractKey &
  Readonly<{ reloadedBoothCount: number; reloadedByUserId: string }>

export type TollBoothCatalogReloadAuditInput = Readonly<{
  actorUserId: string
  companyId: string
  correlationId: string
  entityId: string
  metadata: Readonly<{ dataset: string; observedOn: string; savedBoothCount: number }>
}>

export type TollBoothCatalogReloadWork = Readonly<{
  insertAudit: (input: TollBoothCatalogReloadAuditInput) => Promise<void>
  /** Grava `reloaded_*` e zera `missing_object_observed_at`; linha ausente lança 404. */
  markReloaded: (
    input: MarkTollBoothExtractReloadedInput,
  ) => Promise<Readonly<{ reloadedAt: Date }>>
  readCatalogSummary: TollBoothRepository['readCatalogSummary']
  saveMany: TollBoothRepository['saveMany']
}>

export type TollBoothCatalogReloadPort = Readonly<{
  /** Trava ocupada lança `TollBoothCatalogReloadInProgressError` sem esperar. */
  runExclusive: <TResult>(
    work: (unit: TollBoothCatalogReloadWork) => Promise<TResult>,
  ) => Promise<TResult>
}>
