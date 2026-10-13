/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 (quem pegou): "pegou" é o ator da transição mais recente para `under_review` — a ação
 * `review`, a única porta da tratativa para frente. Sai do histórico de eventos; não existe coluna.
 * A leitura é sempre atada ao `company_id` da própria tratativa (BOLA) e nunca devolve e-mail,
 * telefone ou CPF — só o nome do perfil.
 */
import { sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { tripOccurrenceCaseEvents, tripOccurrenceCases } from '../../database/trip.schema.js'

export const takenByEvent = alias(tripOccurrenceCaseEvents, 'trip_occurrence_taken_by_event')
export const takenByProfile = alias(identityUserProfiles, 'trip_occurrence_taken_by_profile')

/** O id do evento `→ under_review` mais recente desta tratativa, ou `null` se ninguém pegou. */
export function latestTakenEventId(): SQL {
  return sql`(
    select latest.id from trip_occurrence_case_events latest
    where latest.company_id = ${tripOccurrenceCases.companyId}
      and latest.case_id = ${tripOccurrenceCases.id}
      and latest.to_status = 'under_review'
      and latest.actor_kind = 'internal'
    order by latest.occurred_at desc, latest.id desc
    limit 1
  )`
}

export type TakenByView = {
  readonly displayName: string | null
  readonly takenAt: string
}

export function buildTakenByView(row: {
  readonly takenAt: Date | null
  readonly takenByName: string | null
}): TakenByView | null {
  if (row.takenAt === null) return null
  return { displayName: row.takenByName, takenAt: row.takenAt.toISOString() }
}
