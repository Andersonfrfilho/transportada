/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import {
  deliveryClientExceptions,
  deliveryClientWindows,
  deliveryClients,
  municipalHolidays,
} from '../../database/delivery-client.schema.js'
import { resolveStopWindows } from '../domain/pool-window.policy.js'
import type { PoolWindowIntervals, PoolWindowStop } from '../domain/pool-window.policy.js'

type PoolWindowDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Spec 058 P2 + 060 D2: **a hora em que o cliente recebe**, resolvida pelo documento do destinatário.
 * Uma consulta por tabela, não uma por parada: um pool de oitenta notas viraria oitenta idas ao banco
 * numa rotina que já é a mais pesada do worker.
 *
 * A precedência é a da 060, e ela vem da política copiada — exceção do cliente vence feriado do
 * município, e cliente sem cadastro de janela é **ausência de restrição**, não fechado. O feriado
 * vale só para a parada da cidade dele: o cliente de outra cidade do mesmo roteiro não fecha.
 */
export async function readPoolWindows(input: {
  readonly companyId: string
  readonly database: PoolWindowDatabase
  readonly date: string
  readonly stops: readonly PoolWindowStop[]
}): Promise<PoolWindowIntervals> {
  const taxIds = [...new Set(input.stops.flatMap((stop) => stop.taxIds))]
  if (taxIds.length === 0) return new Map()

  const clients = await input.database
    .select({ id: deliveryClients.id, taxId: deliveryClients.taxId })
    .from(deliveryClients)
    .where(
      and(eq(deliveryClients.companyId, input.companyId), inArray(deliveryClients.taxId, taxIds)),
    )
  if (clients.length === 0) return new Map()

  const sources = await readWindowSources({
    clientIds: clients.map((client) => client.id),
    companyId: input.companyId,
    database: input.database,
    date: input.date,
    stops: input.stops,
  })

  return resolveStopWindows({ clients, date: input.date, sources, stops: input.stops })
}

async function readWindowSources(input: {
  readonly clientIds: readonly string[]
  readonly companyId: string
  readonly database: PoolWindowDatabase
  readonly date: string
  readonly stops: readonly PoolWindowStop[]
}) {
  const cityCodes = [
    ...new Set(
      input.stops
        .map((stop) => stop.cityCode)
        .filter((cityCode): cityCode is string => cityCode !== null && cityCode !== ''),
    ),
  ]
  const clientIds = [...input.clientIds]

  const [windows, exceptions, holidays] = await Promise.all([
    input.database
      .select({
        closesAt: deliveryClientWindows.closesAt,
        deliveryClientId: deliveryClientWindows.deliveryClientId,
        opensAt: deliveryClientWindows.opensAt,
        weekday: deliveryClientWindows.weekday,
      })
      .from(deliveryClientWindows)
      .where(
        and(
          eq(deliveryClientWindows.companyId, input.companyId),
          inArray(deliveryClientWindows.deliveryClientId, clientIds),
        ),
      ),
    input.database
      .select({
        closesAt: deliveryClientExceptions.closesAt,
        deliveryClientId: deliveryClientExceptions.deliveryClientId,
        exceptionOn: deliveryClientExceptions.exceptionOn,
        kind: deliveryClientExceptions.kind,
        opensAt: deliveryClientExceptions.opensAt,
      })
      .from(deliveryClientExceptions)
      .where(
        and(
          eq(deliveryClientExceptions.companyId, input.companyId),
          inArray(deliveryClientExceptions.deliveryClientId, clientIds),
          eq(deliveryClientExceptions.exceptionOn, input.date),
        ),
      ),
    cityCodes.length === 0
      ? Promise.resolve([])
      : input.database
          .select({
            cityIbgeCode: municipalHolidays.cityIbgeCode,
            holidayOn: municipalHolidays.holidayOn,
          })
          .from(municipalHolidays)
          .where(
            and(
              eq(municipalHolidays.companyId, input.companyId),
              inArray(municipalHolidays.cityIbgeCode, cityCodes),
              eq(municipalHolidays.holidayOn, input.date),
            ),
          ),
  ])

  return { exceptions, holidays, windows }
}
