/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocumentDetail, TripDocumentSeparationStatus } from './trip.types'

/**
 * Situação fiscal que invalida o documento sem impedir a viagem: a spec 027 pede aviso visível,
 * não bloqueio — a nota cancelada continua vinculada e o MDF-e segue emissível.
 */
export const TRIP_FISCAL_WARNING_STATUSES = ['cancelled', 'denied', 'rejected'] as const

/**
 * Spec 079 T017: a nota se chama pelo **número e série** que estão impressos na etiqueta da caixa.
 *
 * ⚠️ Ninguém no galpão procura nota por UUID — e era o UUID que esta função imprimia, na listagem de
 * entregas e na prontidão fiscal. É a mesma família do rótulo da parada, que imprimia rua sem
 * número: identificador interno na tela é sempre defeito, nunca economia.
 *
 * A queda para o identificador **continua existindo** — vínculo que é só cálculo de frete, nota
 * ainda não servida com número —, mas deixou de ser o caminho normal. Série vazia é o emitente que
 * não a usa: o número sozinho identifica, e uma barra solta no fim não.
 */
export function tripDocumentLabel(document: TripDocumentLabelSource): string {
  const number = (document.nfeNumber ?? '').trim()
  if (number === '') return document.nfeDocumentId ?? document.freightCalculationId ?? document.id

  const series = (document.nfeSeries ?? '').trim()
  return series === '' ? number : `${number}/${series}`
}

export function hasTripDocumentFiscalWarning(document: TripDocumentDetail): boolean {
  return TRIP_FISCAL_WARNING_STATUSES.some((status) => status === document.fiscalStatus)
}

export function hasTripFiscalWarning(documents: readonly TripDocumentDetail[]): boolean {
  return documents.some(hasTripDocumentFiscalWarning)
}

/** Chave de tradução do status fiscal; o valor cru vira o fallback de status ainda não mapeado. */
export function tripFiscalStatusKey(fiscalStatus: string): string {
  return `fiscalStatus.${fiscalStatus}`
}

/**
 * Spec 181 RF3/CA03: o código do motivo de devolução, só quando há um a mostrar — nota devolvida
 * sem motivo, ou nota que não é devolução, não carrega sufixo nenhum no selo de pipeline. O
 * selo compõe a tradução (`fieldActions.returnReason.*`); esta função só decide **se** há o quê.
 */
export function tripDocumentReturnReasonCode(
  document: TripDocumentReturnReasonSource,
): null | string {
  if (document.separationStatus !== 'returned') return null
  if (document.returnReason === null || document.returnReason === '') return null
  return document.returnReason
}

export type TripDocumentReturnReasonSource = Readonly<{
  returnReason: null | string
  separationStatus: TripDocumentSeparationStatus
}>

/** Só o que nomeia a nota: assim o rótulo se prova sem montar um `TripDocumentDetail` inteiro. */
export type TripDocumentLabelSource = Readonly<{
  freightCalculationId: null | string
  id: string
  nfeDocumentId: null | string
  nfeNumber?: null | string
  nfeSeries?: null | string
}>
