/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { HOLIDAY_IMPORT_HEADLINE, HOLIDAY_IMPORT_SCOPES } from './holidayImport.constant'

export type HolidayImportScope = (typeof HOLIDAY_IMPORT_SCOPES)[number]
export type HolidayImportHeadline =
  (typeof HOLIDAY_IMPORT_HEADLINE)[keyof typeof HOLIDAY_IMPORT_HEADLINE]

/** Pares (cidade, ano) do horizonte; os que o cache ainda não tem contam como pendentes. */
export type HolidayImportPairCounts = Readonly<{
  done: number
  failed: number
  notCovered: number
  pending: number
  /** Subconjunto de `failed`. Ausente na API anterior ao cartão honesto: a tela se comporta como antes. */
  planRestricted?: number
  quotaExhausted: number
  total: number
}>

export type HolidayImportFailure = Readonly<{ errorCode: string; pairs: number }>

/** A linha da PRÓPRIA empresa cuja data o fornecedor deixou de listar: ela fica, sinalizada. */
export type HolidayImportRemoved = Readonly<{
  holidayId: string
  holidayOn: string
  ibgeCode: string
  name: string
  scope: HolidayImportScope
}>

/** `truncated`: há mais removidos do que o teto da lista; o resto aparece quando os primeiros forem tratados. */
export type HolidayImportRemovedList = Readonly<{
  items: readonly HolidayImportRemoved[]
  truncated: boolean
}>

/** O último ciclo ENCERRADO da rotina: só o desfecho (vocabulário do catálogo) e quando terminou. */
export type HolidayImportLastRun = Readonly<{ finishedAt: string; outcome: string }>

export type HolidayImportStatus = Readonly<{
  failures: readonly HolidayImportFailure[]
  isEnabled: boolean
  lastFetchedAt: string | null
  /** Ausente na API anterior ao cartão honesto; `null`: a rotina nunca encerrou um ciclo. */
  lastRun?: HolidayImportLastRun | null
  /** O primeiro dia do mês do orçamento. */
  month: string
  /** Requisições do mês na instalação — o contador é do banco, não da empresa. */
  monthlyRequests: number
  pairs: HolidayImportPairCounts
  removedByProvider: HolidayImportRemovedList
  totalCities: number
}>

export type HolidayImportSuppression = Readonly<{
  holidayOn: string
  ibgeCode: string
  id: string
  scope: HolidayImportScope
  suppressedAt: string
}>

export type HolidayImportSuppressionsPage = Readonly<{
  items: readonly HolidayImportSuppression[]
  page: number
  perPage: number
  total: number
}>

export type HolidayImportStatusView = Readonly<{
  failedPairs: number
  failures: readonly Readonly<{ code: string; messageKey: string; pairs: number }>[]
  headline: HolidayImportHeadline
  lastRunFinishedAt: string | null
  planRestrictedPairs: number
  progress: Readonly<{ done: number; ratio: number; total: number }>
}>
