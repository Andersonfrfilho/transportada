/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097: de onde a rota da montagem parte. Consulta própria e direta, como
 * `route-geometry-vehicle-axles.query.ts` — a linha que interessa é a mesma que o solver do worker
 * já lê (`company_route_optimization_settings` + `geocoded_addresses`), e nenhuma das duas
 * pertence à árvore de `trips/`. Trazer o repositório inteiro do módulo `routing/` para pedir três
 * colunas seria acoplamento por conveniência.
 *
 * ⚠️ Quem decide se a rota termina no barracão, num endereço declarado, ou na última entrega é
 * `resolveRouteEndAddressKey` (T1) — esta consulta só entrega a ela o que está gravado e geocodifica
 * a chave que ela devolver. É por isso que nenhuma política nomeada aparece aqui.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray } from 'drizzle-orm'

import {
  companyContacts,
  companyFiscalProfiles,
  companyRouteOptimizationSettings,
  geocodedAddresses,
} from '../../database/database.schema.js'
import {
  resolveDepotDescription,
  type DepotDescription,
} from '../domain/depot-description.policy.js'
import { resolveRouteEndAddressKey, type RouteDepot } from '../domain/route-depot.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createRouteDepotQuery(database: Database): Readonly<{
  readDepot: (input: { readonly companyId: string }) => Promise<RouteDepot>
  readDescription: (input: { readonly companyId: string }) => Promise<DepotDescription | null>
}> {
  return {
    /**
     * Quem é a empresa, para a linha da perna dizer de onde o caminhão sai. Duas leituras curtas em
     * paralelo, as duas escopadas pelo `companyId` do contexto.
     *
     * ⚠️ O telefone é o **primeiro** contato do tipo `phone`, pela ordem que a empresa escolheu em
     * `position` — não uma escolha nossa entre vários. Sem nenhum, é ausência, e a política decide
     * o que a tela faz com isso.
     */
    async readDescription(input) {
      const [profile, contact] = await Promise.all([
        database
          .select({
            city: companyFiscalProfiles.city,
            district: companyFiscalProfiles.district,
            legalName: companyFiscalProfiles.legalName,
            number: companyFiscalProfiles.number,
            postalCode: companyFiscalProfiles.postalCode,
            state: companyFiscalProfiles.state,
            street: companyFiscalProfiles.street,
            tradeName: companyFiscalProfiles.tradeName,
          })
          .from(companyFiscalProfiles)
          .where(eq(companyFiscalProfiles.companyId, input.companyId))
          .limit(1),
        database
          .select({ value: companyContacts.value })
          .from(companyContacts)
          .where(
            and(eq(companyContacts.companyId, input.companyId), eq(companyContacts.kind, 'phone')),
          )
          .orderBy(asc(companyContacts.position))
          .limit(1),
      ])

      return resolveDepotDescription({
        phone: contact[0]?.value ?? null,
        profile: profile[0] ?? null,
      })
    },
    async readDepot(input) {
      const [settings] = await database
        .select({
          endAddressKey: companyRouteOptimizationSettings.endAddressKey,
          endPolicy: companyRouteOptimizationSettings.endPolicy,
          originAddressKey: companyRouteOptimizationSettings.originAddressKey,
        })
        .from(companyRouteOptimizationSettings)
        .where(eq(companyRouteOptimizationSettings.companyId, input.companyId))
        .limit(1)

      /** Sem linha, `originAddressKey` é `''` — a mesma ausência que a coluna nasce com. */
      if (settings === undefined || settings.originAddressKey === '') {
        return { reason: 'not_configured', status: 'absent' }
      }

      const endAddressKey = resolveRouteEndAddressKey(settings)
      const keys = [
        settings.originAddressKey,
        ...(endAddressKey === null || endAddressKey === settings.originAddressKey
          ? []
          : [endAddressKey]),
      ]

      const rows = await database
        .select({
          addressKey: geocodedAddresses.addressKey,
          latitude: geocodedAddresses.latitude,
          longitude: geocodedAddresses.longitude,
        })
        .from(geocodedAddresses)
        .where(inArray(geocodedAddresses.addressKey, keys))

      const pointByKey = new Map(rows.map((row) => [row.addressKey, toPoint(row)]))
      const origin = pointByKey.get(settings.originAddressKey)
      if (origin === undefined) return { reason: 'not_geocoded', status: 'absent' }

      /**
       * ⚠️ Fim declarado sem coordenada não derruba o barracão inteiro — a origem já resolveu o
       * que a D2 exige. A rota fica sem o retorno, e é o mesmo "nada inventado" aplicado à outra
       * ponta.
       */
      const end =
        endAddressKey === null
          ? null
          : endAddressKey === settings.originAddressKey
            ? origin
            : (pointByKey.get(endAddressKey) ?? null)

      return { end, origin, status: 'resolved' }
    },
  }
}

function toPoint(row: {
  readonly latitude: string
  readonly longitude: string
}): RouteGeometryPoint {
  return { latitude: Number(row.latitude), longitude: Number(row.longitude) }
}
