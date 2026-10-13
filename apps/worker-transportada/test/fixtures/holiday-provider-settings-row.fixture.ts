/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262: grava a linha única de `holiday_provider_settings` como a API a grava, para as integrações do worker.
 * O envelope entra como `text` e é convertido para `jsonb` (o Bun serializa uma `string` passada direto a
 * `::jsonb` como string JSON, e a CHECK da tabela exige um objeto).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ACTOR_ID = '00000000-0000-4000-8000-0000000000a1'

export async function insertProviderSettings(
  database: Database,
  input: {
    readonly budget?: number | null
    readonly envelope?: unknown
    readonly settingsId: string
  },
): Promise<void> {
  const hasToken = input.envelope !== undefined
  await database.execute(sql`
    insert into holiday_provider_settings
      (id, token_envelope, token_hint, token_updated_at, monthly_request_budget, updated_by_user_id)
    values (
      ${input.settingsId},
      ${hasToken ? JSON.stringify(input.envelope) : null}::text::jsonb,
      ${hasToken ? 'Q7zK' : null},
      ${hasToken ? new Date().toISOString() : null}::timestamptz,
      ${input.budget ?? null},
      ${ACTOR_ID})`)
}

export async function replaceProviderEnvelope(
  database: Database,
  envelope: unknown,
): Promise<void> {
  await database.execute(sql`
    update holiday_provider_settings set token_envelope = ${JSON.stringify(envelope)}::text::jsonb`)
}
