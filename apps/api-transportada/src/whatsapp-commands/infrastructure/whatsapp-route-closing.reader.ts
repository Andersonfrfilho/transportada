/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 RF12: o que a despedida de "rota concluída" diz — quantas paradas a viagem tinha e o nome do motorista. A última baixa
 * já concluiu a viagem (ela some da lista de viagens ativas), então UMA consulta lê a viagem concluída mais recente do motorista.
 * Melhor esforço: sem leitura, a mensagem sai sem o número e sem o nome. Log sem PII: só empresa e nome do erro.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type WhatsAppRouteClosing = {
  readonly driverName: string
  readonly totalStops: number
}

export type WhatsAppRouteClosingReader = (input: {
  readonly companyId: string
  readonly driverId: string
}) => Promise<WhatsAppRouteClosing | null>

export function createWhatsAppRouteClosingReader(dependencies: {
  readonly database: Database
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
}): WhatsAppRouteClosingReader {
  return async ({ companyId, driverId }) => {
    try {
      const rows = (await dependencies.database.execute(sql`
        select crew.driver_name as driver_name,
               (select count(*)::int from trip_stops stop
                 where stop.company_id = trip.company_id and stop.trip_id = trip.id) as total_stops
          from trips trip
          join trip_drivers crew
            on crew.company_id = trip.company_id and crew.trip_id = trip.id and crew.driver_id = ${driverId}::uuid
         where trip.company_id = ${companyId}::uuid and trip.status = 'completed'
         order by trip.updated_at desc
         limit 1`)) as unknown as readonly { driver_name?: unknown; total_stops?: unknown }[]
      const [row] = rows
      if (row === undefined || typeof row.driver_name !== 'string') return null
      return { driverName: row.driver_name, totalStops: Number(row.total_stops) }
    } catch (error) {
      dependencies.logger?.warn('whatsapp_route_closing.read_failed', {
        companyId,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      return null
    }
  }
}
