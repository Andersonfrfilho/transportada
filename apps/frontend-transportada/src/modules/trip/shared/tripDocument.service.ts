/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocumentDetail } from './trip.types'

/**
 * Situação fiscal que invalida o documento sem impedir a viagem: a spec 027 pede aviso visível,
 * não bloqueio — a nota cancelada continua vinculada e o MDF-e segue emissível.
 */
export const TRIP_FISCAL_WARNING_STATUSES = ['cancelled', 'denied', 'rejected'] as const

export function tripDocumentLabel(document: TripDocumentDetail): string {
  return document.nfeDocumentId ?? document.freightCalculationId ?? document.id
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
