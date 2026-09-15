/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/nfe.schema.js'
import { resolveDepotOrigin } from '../domain/depot-origin.policy.js'

type DepotOriginDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * A chave de onde o solver parte (spec 097 D7): a origem configurada, ou o endereço cadastrado da
 * empresa quando não há. `''` é "sem origem" — o mesmo vazio com que a coluna nasce, e que
 * `readPoint` já trata como ausência.
 */
export async function readDepotOriginAddressKey(input: {
  readonly companyId: string
  readonly configuredAddressKey: string
  readonly database: DepotOriginDatabase
}): Promise<string> {
  const [profile] = await input.database
    .select({
      cityIbgeCode: companyFiscalProfiles.cityIbgeCode,
      number: companyFiscalProfiles.number,
      postalCode: companyFiscalProfiles.postalCode,
    })
    .from(companyFiscalProfiles)
    .where(eq(companyFiscalProfiles.companyId, input.companyId))
    .limit(1)

  const origin = resolveDepotOrigin({
    companyAddress: profile ?? null,
    configuredAddressKey: input.configuredAddressKey,
  })

  return origin?.addressKey ?? ''
}
