/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { getTableName, inArray, lt, sql } from 'drizzle-orm'
import type { Name, SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { companyLocationRetentionSettings } from '../../database/company-location-retention-settings.schema.js'
import { timestamptzParameter } from '../../database/sql-timestamptz-parameter.support.js'
import {
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripLocationPings,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
} from '../../database/trip-execution.schema.js'
import type {
  CountEligibleCompanies,
  PurgeStalePings,
  RedactDeliveryProofLocations,
  RedactDocumentOccurrenceLocations,
  RedactStatusEventLocations,
  RedactStopOccurrenceLocations,
  RedactTripLocations,
} from '../application/trip-location.port.js'
import { EXPIRED_LOCATION_STATE } from '../domain/trip-location-purge.constant.js'

export type TripLocationDatabase = ReturnType<typeof createDrizzleProvider>['db']

type LocatedEventTable =
  | typeof tripDeliveryProofs
  | typeof tripDocumentOccurrences
  | typeof tripStatusEvents
  | typeof tripStopEvents
  | typeof tripStopOccurrences

type LocatedEventStatementParams = {
  /** O comprovante guarda a hora declarada da foto; as outras quatro tabelas a apagam com a posição. */
  readonly clearsCapturedAt: boolean
  readonly limit: number
  readonly now: Date
  readonly table: LocatedEventTable
  readonly timeColumn: AnyPgColumn
}

type RedactLocatedEventRowsParams = LocatedEventStatementParams & {
  readonly database: TripLocationDatabase
}

function identifier(column: AnyPgColumn): Name {
  return sql.identifier(column.name)
}

/**
 * Spec 239 D2: um `UPDATE` só por lote, com `CROSS JOIN LATERAL` sobre as empresas elegíveis. O `LATERAL`
 * entra no índice `(company_id, tempo)` uma vez por empresa, e o `LIMIT` interno impede que uma empresa
 * com fila grande devore o lote das outras. Cada linha é comparada só com o prazo da própria empresa
 * (`x.company_id = s.company_id`); empresa sem linha de configuração, desligada ou em carência não entra.
 *
 * ⚠️ Sem `FOR UPDATE SKIP LOCKED`; se um dia houver `FOR UPDATE` na subconsulta, tem de ser `FOR UPDATE
 * OF x` — sem o `OF` ele trava a linha de configuração e o `PUT` da tela espera.
 * `latitude IS NOT NULL` fora da subconsulta repete o filtro: reexecutar o lote não escreve duas vezes.
 * O `ORDER BY` do `LATERAL` apaga o mais antigo primeiro e, medido, impede o planejador de varrer a
 * tabela inteira para achar zero linha: sem ele, com a fila esvaziada, o `LIMIT` o faz apostar num
 * `Seq Scan` que nunca termina cedo (spec 239, `evidence.md` T2.2).
 */
export function buildLocatedEventRedactionStatement(params: LocatedEventStatementParams): SQL {
  const { clearsCapturedAt, limit, now, table, timeColumn } = params
  const settings = companyLocationRetentionSettings
  const tableName = sql.identifier(getTableName(table))
  const nowParameter = timestamptzParameter(now)
  const capturedAtAssignment = clearsCapturedAt
    ? sql`, ${sql.identifier('captured_at')} = null`
    : sql``

  return sql`
    update ${tableName} as t
    set ${identifier(table.latitude)} = null,
        ${identifier(table.longitude)} = null,
        ${identifier(table.accuracyMeters)} = null${capturedAtAssignment},
        ${identifier(table.locationState)} = ${EXPIRED_LOCATION_STATE}
    where t.${identifier(table.latitude)} is not null
      and t.${identifier(table.id)} in (
        select e.id
        from ${sql.identifier(getTableName(settings))} as s
        cross join lateral (
          select x.${identifier(table.id)} as id
          from ${tableName} as x
          where x.${identifier(table.companyId)} = s.${identifier(settings.companyId)}
            and x.${identifier(table.latitude)} is not null
            and x.${identifier(timeColumn)} < ${nowParameter}
              - make_interval(days => s.${identifier(settings.retentionDays)})
          order by x.${identifier(timeColumn)}
          limit ${limit}
        ) as e
        where s.${identifier(settings.purgeEnabled)}
          and s.${identifier(settings.purgeEffectiveAt)} <= ${nowParameter}
        limit ${limit}
      )
    returning t.${identifier(table.id)}
  `
}

async function redactLocatedEventRows(params: RedactLocatedEventRowsParams): Promise<number> {
  const { database, ...statementParams } = params
  const rows = await database.execute(buildLocatedEventRedactionStatement(statementParams))
  return rows.length
}

export function createDrizzleRedactStatusEventLocations(
  database: TripLocationDatabase,
): RedactStatusEventLocations {
  return ({ now, limit }) =>
    redactLocatedEventRows({
      clearsCapturedAt: true,
      database,
      limit,
      now,
      table: tripStatusEvents,
      timeColumn: tripStatusEvents.recordedAt,
    })
}

export function createDrizzleRedactStopOccurrenceLocations(
  database: TripLocationDatabase,
): RedactStopOccurrenceLocations {
  return ({ now, limit }) =>
    redactLocatedEventRows({
      clearsCapturedAt: true,
      database,
      limit,
      now,
      table: tripStopOccurrences,
      timeColumn: tripStopOccurrences.createdAt,
    })
}

export function createDrizzleRedactDocumentOccurrenceLocations(
  database: TripLocationDatabase,
): RedactDocumentOccurrenceLocations {
  return ({ now, limit }) =>
    redactLocatedEventRows({
      clearsCapturedAt: true,
      database,
      limit,
      now,
      table: tripDocumentOccurrences,
      timeColumn: tripDocumentOccurrences.createdAt,
    })
}

export function createDrizzleRedactTripLocations(
  database: TripLocationDatabase,
): RedactTripLocations {
  return ({ now, limit }) =>
    redactLocatedEventRows({
      clearsCapturedAt: true,
      database,
      limit,
      now,
      table: tripStopEvents,
      timeColumn: tripStopEvents.createdAt,
    })
}

/** Spec 159 T11: só a posição da foto cai — o arquivo, o veredito e o horário declarado ficam. */
export function createDrizzleRedactDeliveryProofLocations(
  database: TripLocationDatabase,
): RedactDeliveryProofLocations {
  return ({ now, limit }) =>
    redactLocatedEventRows({
      clearsCapturedAt: false,
      database,
      limit,
      now,
      table: tripDeliveryProofs,
      timeColumn: tripDeliveryProofs.createdAt,
    })
}

/**
 * Spec 239 D3: empresas com o expurgo ligado e a carência vencida em `now`. Zero dispensa as cinco
 * varreduras; tabela ausente (`42P01`) lança, e o ciclo falha inteiro sem apagar nada.
 */
export function createDrizzleCountEligibleCompanies(
  database: TripLocationDatabase,
): CountEligibleCompanies {
  return async ({ now }) => {
    const settings = companyLocationRetentionSettings
    const rows = await database.execute(sql`
      select count(*)::int as eligible
      from ${sql.identifier(getTableName(settings))}
      where ${identifier(settings.purgeEnabled)}
        and ${identifier(settings.purgeEffectiveAt)} <= ${timestamptzParameter(now)}
    `)
    return Number(rows[0]?.eligible ?? 0)
  }
}

/** A linha inteira cai: ping sem posição não é dado, ao contrário do evento de parada. */
export function createDrizzlePurgeStalePings(database: TripLocationDatabase): PurgeStalePings {
  return async ({ before, limit }) => {
    const expired = await database
      .select({ id: tripLocationPings.id })
      .from(tripLocationPings)
      .where(lt(tripLocationPings.recordedAt, before))
      .limit(limit)

    if (expired.length === 0) return 0

    await database.delete(tripLocationPings).where(
      inArray(
        tripLocationPings.id,
        expired.map((row) => row.id),
      ),
    )

    return expired.length
  }
}
