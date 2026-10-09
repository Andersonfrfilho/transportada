/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §3): o orçamento de requisições do mês. É o ÚNICO dado do cache global que não é
 * recortado por cidade — o contador é da instalação (ADR-0021, um deploy por transportadora), e um número
 * sozinho não identifica empresa, cidade nem data. Junto de `holiday-import-status.query.ts`, é um dos dois
 * arquivos que a API deixa tocar o cache (`test/business-calendar-schema/holiday-import-global-isolation.contract.ts`).
 */
import { eq } from 'drizzle-orm'

import { holidayProviderMonthlyUsage } from '../../database/holiday-provider.schema.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'

type Executor = Pick<BusinessCalendarDatabase, 'select'>

/** Mês sem linha é zero: a linha nasce no primeiro pedido do mês, feito pelo worker. */
export async function readMonthlyRequests(
  executor: Executor,
  input: { readonly month: string },
): Promise<number> {
  const [row] = await executor
    .select({ requests: holidayProviderMonthlyUsage.requests })
    .from(holidayProviderMonthlyUsage)
    .where(eq(holidayProviderMonthlyUsage.month, input.month))
    .limit(1)
  return row?.requests ?? 0
}
