/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { ListPackageBoxMeasurements } from '../application/list-package-box-measurements.use-case.js'
import { parsePackageBoxMeasurementExportList } from './package-box-measurement-export.schema.js'
import type { PackageBoxMeasurementExportListing } from './package-box-measurement-export.schema.js'

export const API_NFE_PACKAGE_BOX_MEASUREMENTS_PATH = '/nfe-package-box-measurements'

/**
 * Spec 152 (T5, R8, experimental): `settings.manage`, e não `cargo.measure` — quem confere caixa no
 * galpão mede; exportar o histórico inteiro da empresa para validar a precisão é decisão de quem
 * administra as configurações, mesmo corte de `CARGO_MEASURE_POLICY` em `package-box.routes.ts`.
 */
const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

export function createPackageBoxMeasurementExportRoutes(dependencies: {
  readonly listPackageBoxMeasurements: ListPackageBoxMeasurements
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<PackageBoxMeasurementExportListing>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listPackageBoxMeasurements.execute({
          companyId: context.scope.companyId,
          cursor: input.cursor,
          from: input.from,
          limit: input.limit,
          to: input.to,
        })
        return new Response(
          JSON.stringify({ data: page.items, page: { nextCursor: page.nextCursor } }),
          {
            headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
            status: 200,
          },
        )
      },
      method: 'GET',
      parse: ({ request }) => parsePackageBoxMeasurementExportList(new URL(request.url)),
      pathname: API_NFE_PACKAGE_BOX_MEASUREMENTS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
