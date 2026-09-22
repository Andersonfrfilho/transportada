/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T13, ADR-0069 §6: o assistente de baixa do escritório precisa saber se a leitura do
 * número do canhoto está ligada. Quem dá a baixa tem `trip.report-on-behalf`, não `settings.manage`,
 * então a rota devolve **só** o interruptor — o molde de `GET /nfe-package-boxes/measurement-settings`
 * (spec 152 D14). O caminho é exato: o roteador casa rota sem parâmetro antes de `/trips/:id`.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { OFFICE_REPORT_POLICY } from './trip-field-office.support.js'

export const TRIP_FIELD_DELIVERY_SETTINGS_PATH = `${API_TRIPS_PATH}/field-delivery-settings`

export type TripFieldDeliverySettingsDependencies = {
  readonly readCanhotoOcrEnabled: (input: { readonly companyId: string }) => Promise<boolean>
}

export function createTripFieldDeliverySettingsRoutes(
  dependencies: TripFieldDeliverySettingsDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const canhotoOcrEnabled = await dependencies.readCanhotoOcrEnabled({
          companyId: context.scope.companyId,
        })
        return new Response(JSON.stringify({ data: { canhotoOcrEnabled } }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: TRIP_FIELD_DELIVERY_SETTINGS_PATH,
      policy: OFFICE_REPORT_POLICY,
    }),
  ]
}
