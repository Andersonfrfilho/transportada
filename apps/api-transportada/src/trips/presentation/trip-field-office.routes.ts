/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5, ADR-0067: o escritório dá baixa em nome do motorista. As rotas espelham as do
 * motorista (`me-trip.routes.ts`), com o `tripId` no caminho — porque quem acha a viagem é a
 * empresa do contexto, nunca um vínculo de motorista logado. Permissão própria,
 * `trip.report-on-behalf`, nunca `trip.manage` (separador) nem `trip.report` (rotas `/me`).
 *
 * Todas chamam os mesmos casos de uso da T3 com `{ target }` — o alvo já resolvido pela empresa,
 * nunca pelo motorista — e a autoria (`channel: 'office'`, `onBehalfOfDriverId`) nasce sozinha
 * disso (`deriveFieldAuthorship`). Cada ação grava em `audit_logs` na transação dela (T15 M11): é
 * ação sensível, ela encerra entrega que outra pessoa fez.
 *
 * Spec 156 T15 (M12): as rotas moram por responsabilidade — viagem e parada em
 * `trip-field-office-trip.routes.ts`, nota em `trip-field-office-document.routes.ts`, e o que as
 * duas dividem em `trip-field-office.support.ts`. A ordem abaixo é a do registro no roteador.
 */
import type { defineRoute } from '../../http/router.service.js'
import {
  createTripFieldOfficeDocumentRoutes,
  type TripFieldOfficeDocumentDependencies,
} from './trip-field-office-document.routes.js'
import {
  createTripFieldOfficeTripRoutes,
  type TripFieldOfficeTripDependencies,
} from './trip-field-office-trip.routes.js'

export {
  OFFICE_REPORT_POLICY,
  OFFICE_TRIP_PATH,
  resolveOfficeTarget,
} from './trip-field-office.support.js'

export type TripFieldOfficeDependencies = TripFieldOfficeDocumentDependencies &
  TripFieldOfficeTripDependencies

export function createTripFieldOfficeRoutes(
  dependencies: TripFieldOfficeDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    ...createTripFieldOfficeTripRoutes(dependencies),
    ...createTripFieldOfficeDocumentRoutes(dependencies),
  ]
}
