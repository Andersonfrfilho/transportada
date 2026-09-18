/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5/T15 (M12): o que as rotas do escritório em nome do motorista dividem — o caminho, a
 * política, o alvo resolvido pela empresa do contexto e a resposta JSON sem cache.
 */
import { JSON_CONTENT_TYPE, API_TRIPS_PATH } from '../../shared/api.constant.js'
import type { FieldTripTargetPort } from '../application/field-trip-target.port.js'
import {
  FIELD_TRIP_TARGET_KIND,
  type ResolvedTripFieldTarget,
  type TripFieldTripTarget,
} from '../application/field-trip-target.types.js'
import { resolveFieldTripTarget } from '../application/resolve-field-trip-target.use-case.js'
import type { OfficeAuditRequest } from '../application/trip-field-office-audit.port.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../domain/trip-permission.constant.js'

export const OFFICE_TRIP_PATH = `${API_TRIPS_PATH}/:id`

/**
 * A baixa do escritório é permissão própria (ADR-0067 §1): nem `trip.manage` (o separador a tem,
 * e ele não reporta entrega), nem `trip.report` (é a chave das rotas `/me`, que acham a viagem
 * pelo vínculo do motorista logado).
 */
export const OFFICE_REPORT_POLICY = {
  permission: TRIP_REPORT_ON_BEHALF_PERMISSION,
  scope: 'company',
} as const

/** O que toda ação do escritório leva ao caso de uso: quem clicou, a empresa e a trilha. */
export type OfficeContextInput = {
  readonly actorUserId: string
  readonly companyId: string
  /** Spec 156 T15 M11: a trilha nasce na transação da ação, no caso de uso — não depois, na rota. */
  readonly officeAudit: OfficeAuditRequest
}

/** `security.md` §10: a ação, a requisição e o IP de quem clicou. */
export function buildOfficeContextInput(input: {
  readonly action: string
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
}): OfficeContextInput {
  return {
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    officeAudit: {
      action: input.action,
      correlationId: input.correlationId,
      ipAddress: input.ipAddress,
    },
  }
}

export function officeJsonResponse(input: {
  readonly body: object
  readonly status: number
}): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

/**
 * Viagem de outra empresa ou inexistente responde 404 `TRIP_NOT_FOUND` (ADR-0067 §2, isolamento);
 * sem motorista, 422 `TRIP_WITHOUT_DRIVER`; `driverId` fora da tripulação, 422 `DRIVER_NOT_ON_TRIP`
 * — as três decisões são de `resolveFieldTripTarget`/`pickOnBehalfOfDriver`, não desta rota.
 */
export async function resolveOfficeTarget(input: {
  readonly companyId: string
  readonly driverId: string | undefined
  readonly targets: FieldTripTargetPort
  readonly tripId: string
}): Promise<ResolvedTripFieldTarget> {
  const target: TripFieldTripTarget =
    input.driverId === undefined
      ? { kind: FIELD_TRIP_TARGET_KIND.trip, tripId: input.tripId }
      : { driverId: input.driverId, kind: FIELD_TRIP_TARGET_KIND.trip, tripId: input.tripId }

  return resolveFieldTripTarget({
    companyId: input.companyId,
    repository: input.targets,
    target,
  })
}
