/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { parseEnvironment } from '../config/environment.schema.js'
import { createFleetDriversUseCase } from '../fleet/application/fleet-drivers.use-case.js'
import type { FleetDriversUseCase } from '../fleet/application/fleet-drivers.use-case.js'
import type { FleetCompanyContext } from '../fleet/application/fleet.port.js'
import { DrizzleFleetDriverRepository } from '../fleet/infrastructure/drizzle-fleet-driver.repository.js'
import { createIdentityContactDirectoryGateway } from '../fleet/infrastructure/identity-contact-directory.gateway.js'
import { createInvitationCodeSecretService } from '../identity/application/invitation-code-secret.service.js'
import { createInviteCompanyUserUseCase } from '../identity/application/invite-company-user.use-case.js'
import { DrizzleCompanyUserRepository } from '../identity/infrastructure/drizzle-company-user.repository.js'
import { DrizzleInvitationDeliveryOutboxRepository } from '../identity/infrastructure/drizzle-invitation-delivery-outbox.repository.js'
import { DrizzleInvitationRepository } from '../identity/infrastructure/drizzle-invitation.repository.js'
import { createIdentityAccessGateway } from '../identity/infrastructure/keycloak-admin.gateway.js'
import { LOCAL_COMPANY_ID, LOCAL_IDENTITY_USER_ID } from './local-identity-seed.constant.js'
import { LOCAL_FLEET_DRIVER_SEEDS } from './local-fleet-seed.constant.js'

type SeedLocalFleetDriversParams = {
  readonly context: FleetCompanyContext
  readonly correlationId: string
  readonly useCase: FleetDriversUseCase
}

export type SeedLocalFleetDriversResult = {
  readonly created: number
  readonly skipped: number
}

type RunLocalFleetSeedParams = {
  readonly appEnvironment: string
  readonly environment: Record<string, string | undefined>
}

const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])
const CORRELATION_ID = 'local-fleet-seed'
const PAGE_LIMIT = 100
/** Trava de laço: a frota local é pequena, e cursor que não avança não pode virar semente infinita. */
const PAGE_CAP = 20

/**
 * A idempotência é pelo documento porque `FleetDriverFilters` não filtra por CPF: cadastrar motorista
 * abre usuário no Keycloak, e repetir a semente não pode abrir o mesmo usuário duas vezes.
 */
export async function seedLocalFleetDrivers({
  context,
  correlationId,
  useCase,
}: SeedLocalFleetDriversParams): Promise<SeedLocalFleetDriversResult> {
  const existing = await listExistingTaxIds({ context, useCase })
  let created = 0
  let skipped = 0

  for (const seed of LOCAL_FLEET_DRIVER_SEEDS) {
    if (existing.has(seed.driver.taxId)) {
      skipped += 1
      continue
    }
    await useCase.create({ context, correlationId, driver: seed.driver, profile: seed.profile })
    created += 1
  }

  return { created, skipped }
}

async function listExistingTaxIds({
  context,
  useCase,
}: Omit<SeedLocalFleetDriversParams, 'correlationId'>): Promise<Set<string>> {
  const taxIds = new Set<string>()
  let cursor: string | null = null

  for (let page = 0; page < PAGE_CAP; page += 1) {
    const result = await useCase.list({ context, cursor, limit: PAGE_LIMIT })
    for (const driver of result.items) taxIds.add(driver.taxId)
    if (result.nextCursor === null) break
    cursor = result.nextCursor
  }

  return taxIds
}

export async function runLocalFleetSeed({
  appEnvironment,
  environment,
}: RunLocalFleetSeedParams): Promise<SeedLocalFleetDriversResult> {
  if (!ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error('Local fleet seed is restricted to local and test environments')
  }

  const config = parseEnvironment(environment)
  const provider = createDrizzleProvider({ connection: config.databaseUrl })

  try {
    const database = provider.db
    const envelopeProvider = createSecretEnvelopeProvider(config.cryptography.envelopeKeyRing)
    const identityGateway = createIdentityAccessGateway({
      clientId: config.keycloak.admin.clientId,
      clientSecret: config.keycloak.admin.clientSecret,
      issuer: config.keycloak.issuer,
    })
    const useCase = createFleetDriversUseCase({
      account: createInviteCompanyUserUseCase({
        envelopeProvider: createInvitationCodeSecretService({ envelopeProvider }),
        identityGateway,
        invitations: new DrizzleInvitationRepository(database),
        issuer: config.keycloak.issuer,
        now: () => new Date(),
        outbox: new DrizzleInvitationDeliveryOutboxRepository(database),
        repository: new DrizzleCompanyUserRepository(database),
      }),
      contacts: createIdentityContactDirectoryGateway({ identity: identityGateway }),
      repository: new DrizzleFleetDriverRepository(database),
    })

    return await seedLocalFleetDrivers({
      context: { companyId: LOCAL_COMPANY_ID, userId: LOCAL_IDENTITY_USER_ID },
      correlationId: CORRELATION_ID,
      useCase,
    })
  } finally {
    await provider.close()
  }
}

if (import.meta.main) {
  const result = await runLocalFleetSeed({
    appEnvironment: process.env.APP_ENV ?? '',
    environment: process.env,
  })
  process.stdout.write(`fleet seed: ${result.created} created, ${result.skipped} skipped\n`)
}
