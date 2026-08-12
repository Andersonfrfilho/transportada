/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq, gt, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'

import { nfseProviderCredentials, nfseServiceInvoices } from '../../database/nfse.schema.js'
import { NFSE_ACTIVE_STATUS } from '../../nfse-invoices/infrastructure/nfse-invoice-issuance.query.js'

/** Os mesmos dois estados que o check `nfse_service_invoices_next_check_state_check` deixa agendar. */
export const NFSE_CALLBACK_ANTICIPATED_STATUSES = [
  'pending_authorization',
  'cancellation_requested',
] as const

type CallbackAnticipationParams = {
  readonly companyId: string
}

/**
 * A empresa vem do token comparado, não do cliente. `next_status_check_at` não nulo e no futuro é o
 * recorte que impede o postback de ressuscitar nota liquidada ou de criar agendamento novo.
 */
export function buildCallbackAnticipationFilters({
  companyId,
}: CallbackAnticipationParams): readonly SQL[] {
  return [
    eq(nfseServiceInvoices.companyId, companyId),
    inArray(nfseServiceInvoices.status, [...NFSE_CALLBACK_ANTICIPATED_STATUSES]),
    isNotNull(nfseServiceInvoices.nextStatusCheckAt),
    gt(nfseServiceInvoices.nextStatusCheckAt, sql`now()`),
  ]
}

/**
 * Sem filtro de empresa de propósito: é esta consulta que descobre a empresa. Comparar o digest
 * aqui devolveria o segredo ao Postgres, que não compara em tempo constante.
 */
export function buildActiveCallbackCredentialFilters(): readonly SQL[] {
  return [eq(nfseProviderCredentials.status, NFSE_ACTIVE_STATUS)]
}
