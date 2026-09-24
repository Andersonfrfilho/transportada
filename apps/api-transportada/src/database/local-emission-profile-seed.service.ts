/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { parseEnvironment } from '../config/environment.schema.js'
import { createIdempotencyFingerprintService } from '../companies/application/idempotency-fingerprint.service.js'
import type { CteEmissionProfileDetail } from '../cte-profiles/application/cte-emission-profile.port.js'
import { createCteEmissionProfilesUseCase } from '../cte-profiles/application/cte-emission-profiles.use-case.js'
import { DrizzleCteEmissionProfileRepository } from '../cte-profiles/infrastructure/drizzle-cte-emission-profile.repository.js'
import { createFreightRulesUseCase } from '../freight-rules/application/freight-rules.use-case.js'
import { DrizzleFreightRepository } from '../freight/infrastructure/drizzle-freight.repository.js'
import type { NfseEmissionProfileDetail } from '../nfse-profiles/application/nfse-profile.port.js'
import { createNfseEmissionProfilesUseCase } from '../nfse-profiles/application/nfse-emission-profiles.use-case.js'
import { DrizzleNfseProfileRepository } from '../nfse-profiles/infrastructure/drizzle-nfse-profile.repository.js'
import { LOCAL_COMPANY_ID, LOCAL_IDENTITY_USER_ID } from './local-identity-seed.constant.js'
import {
  LOCAL_CTE_OUTPUT_FREIGHT_RULE,
  LOCAL_CTE_OUTPUT_PROFILE_MATCHERS,
  LOCAL_CTE_OUTPUT_PROFILE_SETTINGS,
  LOCAL_NFSE_OUTPUT_FREIGHT_RULE,
  LOCAL_NFSE_OUTPUT_PROFILE_MATCHERS,
  LOCAL_NFSE_OUTPUT_PROFILE_SETTINGS_BASE,
  LOCAL_NFSE_PROFILE_SETTINGS_BASE,
} from './local-emission-profile-seed.constant.js'
import { LOCAL_FREIGHT_RULE } from './local-trip-seed.constant.js'

const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])
const CORRELATION_ID = 'local-emission-profile-seed'
const PAGE_LIMIT = 100

export type LocalEmissionProfileSeedResult = {
  readonly cteOutputProfileId: string
  readonly nfseOutputProfileId: string
  readonly nfseProfileId: string
}

type RunLocalEmissionProfileSeedParams = {
  readonly appEnvironment: string
  readonly environment: Record<string, string | undefined>
}

export async function runLocalEmissionProfileSeed({
  appEnvironment,
  environment,
}: RunLocalEmissionProfileSeedParams): Promise<LocalEmissionProfileSeedResult> {
  if (!ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error('Local emission profile seed is restricted to local and test environments')
  }

  const config = parseEnvironment(environment)
  const provider = createDrizzleProvider({ connection: config.databaseUrl })

  try {
    const database = provider.db
    const context = { companyId: LOCAL_COMPANY_ID, userId: LOCAL_IDENTITY_USER_ID }
    const fingerprintService = createIdempotencyFingerprintService({
      key: config.cryptography.idempotencyHmacKey,
    })

    const freightRules = createFreightRulesUseCase({
      fingerprintService,
      unitOfWork: new DrizzleFreightRepository(database),
    })
    const existingFreightRules = await freightRules.list({
      context,
      cursor: null,
      limit: PAGE_LIMIT,
    })
    const bench = existingFreightRules.items.find((rule) => rule.name === LOCAL_FREIGHT_RULE.name)
    if (bench === undefined) {
      throw new Error(
        `Freight rule "${LOCAL_FREIGHT_RULE.name}" not found — run db:seed:trip before this seed`,
      )
    }

    const nfseProfiles = createNfseEmissionProfilesUseCase({
      fingerprintService,
      unitOfWork: new DrizzleNfseProfileRepository(database),
    })
    const nfseProfile = await seedNfseProfile({ context, freightRuleId: bench.id, nfseProfiles })

    const cteProfiles = createCteEmissionProfilesUseCase({
      fingerprintService,
      unitOfWork: new DrizzleCteEmissionProfileRepository(database),
    })
    const cteOutputProfile = await seedCteProfile({
      context,
      cteProfiles,
      matchers: LOCAL_CTE_OUTPUT_PROFILE_MATCHERS,
      settings: LOCAL_CTE_OUTPUT_PROFILE_SETTINGS,
    })
    const nfseOutputProfile = await seedCteProfile({
      context,
      cteProfiles,
      matchers: LOCAL_NFSE_OUTPUT_PROFILE_MATCHERS,
      settings: {
        ...LOCAL_NFSE_OUTPUT_PROFILE_SETTINGS_BASE,
        nfseEmissionProfileId: nfseProfile.id,
      },
    })

    return {
      cteOutputProfileId: cteOutputProfile.id,
      nfseOutputProfileId: nfseOutputProfile.id,
      nfseProfileId: nfseProfile.id,
    }
  } finally {
    await provider.close()
  }
}

async function seedNfseProfile(input: {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly freightRuleId: string
  readonly nfseProfiles: ReturnType<typeof createNfseEmissionProfilesUseCase>
}): Promise<NfseEmissionProfileDetail> {
  const { context, freightRuleId, nfseProfiles } = input
  const settings = { ...LOCAL_NFSE_PROFILE_SETTINGS_BASE, freightRuleId }

  const existing = await nfseProfiles.list({ context, cursor: null, limit: PAGE_LIMIT })
  const found = existing.items.find((profile) => profile.name === settings.name)
  if (found !== undefined) {
    if (found.status === 'active') return found
    return nfseProfiles.activate({
      context,
      correlationId: CORRELATION_ID,
      expectedVersion: found.version,
      profileId: found.id,
    })
  }

  const created = await nfseProfiles.create({
    context,
    correlationId: CORRELATION_ID,
    idempotencyKey: `local-emission-profile-seed-nfse-${context.companyId}`,
    settings,
  })
  return nfseProfiles.activate({
    context,
    correlationId: CORRELATION_ID,
    expectedVersion: created.version,
    profileId: created.id,
  })
}

async function seedCteProfile(input: {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly cteProfiles: ReturnType<typeof createCteEmissionProfilesUseCase>
  readonly matchers: typeof LOCAL_CTE_OUTPUT_PROFILE_MATCHERS
  readonly settings: Parameters<
    ReturnType<typeof createCteEmissionProfilesUseCase>['create']
  >[0]['settings']
}): Promise<CteEmissionProfileDetail> {
  const { context, cteProfiles, matchers, settings } = input

  const existing = await cteProfiles.list({ context, cursor: null, limit: PAGE_LIMIT })
  const found = existing.items.find((profile) => profile.name === settings.name)
  if (found !== undefined) {
    /**
     * Reconcilia em vez de devolver o que achou: o perfil semeado ontem pode ter CNPJ que a semente
     * de hoje não declara mais, e aí a bancada diverge em silêncio do que este arquivo diz.
     */
    const reconciled = await cteProfiles.update({
      components: [],
      context,
      correlationId: CORRELATION_ID,
      expectedVersion: found.version,
      freightRule:
        settings.outputDocument === 'nfse'
          ? LOCAL_NFSE_OUTPUT_FREIGHT_RULE
          : LOCAL_CTE_OUTPUT_FREIGHT_RULE,
      matchers,
      profileId: found.id,
      settings,
    })
    if (reconciled.status === 'active') return reconciled
    return cteProfiles.activate({
      context,
      correlationId: CORRELATION_ID,
      expectedVersion: reconciled.version,
      profileId: reconciled.id,
    })
  }

  const created = await cteProfiles.create({
    components: [],
    context,
    correlationId: CORRELATION_ID,
    freightRule:
      settings.outputDocument === 'nfse'
        ? LOCAL_NFSE_OUTPUT_FREIGHT_RULE
        : LOCAL_CTE_OUTPUT_FREIGHT_RULE,
    idempotencyKey: `local-emission-profile-seed-cte-${context.companyId}-${settings.name}`,
    matchers,
    settings,
  })
  return cteProfiles.activate({
    context,
    correlationId: CORRELATION_ID,
    expectedVersion: created.version,
    profileId: created.id,
  })
}

if (import.meta.main) {
  const result = await runLocalEmissionProfileSeed({
    appEnvironment: process.env.APP_ENV ?? '',
    environment: process.env,
  })
  process.stdout.write(
    `emission profile seed: nfse profile ${result.nfseProfileId}, ` +
      `cte-output profile ${result.cteOutputProfileId}, ` +
      `nfse-output profile ${result.nfseOutputProfileId}\n`,
  )
}
