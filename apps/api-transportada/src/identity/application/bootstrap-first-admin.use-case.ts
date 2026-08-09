/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import { BootstrapUnavailableError } from '../domain/bootstrap.error.js'
import type {
  BootstrapAvailability,
  BootstrapFirstAdminInput,
  BootstrapFirstAdminResult,
  BootstrapIdentityGatewayPort,
  BootstrapRepositoryPort,
} from './bootstrap-first-admin.port.js'

type CreateBootstrapFirstAdminUseCaseParams = {
  readonly companyId: string
  readonly identityGateway: BootstrapIdentityGatewayPort
  readonly issuer: string
  readonly repository: BootstrapRepositoryPort
  readonly token: string | undefined
}

type AssertAvailableInput = {
  readonly token: string | undefined
}

export type BootstrapFirstAdminUseCase = {
  assertAvailable(input: AssertAvailableInput): Promise<void>
  execute(input: BootstrapFirstAdminInput): Promise<BootstrapFirstAdminResult>
}

export function createBootstrapFirstAdminUseCase({
  companyId,
  identityGateway,
  issuer,
  repository,
  token,
}: CreateBootstrapFirstAdminUseCaseParams): BootstrapFirstAdminUseCase {
  return {
    async assertAvailable({ token: attemptedToken }) {
      if (!isConfiguredTokenValid(token)) {
        throw new BootstrapUnavailableError('TOKEN_NOT_CONFIGURED')
      }
      if (!matchesConfiguredToken({ attemptedToken, configuredToken: token })) {
        throw new BootstrapUnavailableError('TOKEN_MISMATCH')
      }

      assertAvailability(await repository.readAvailability({ companyId }))
    },

    async execute({ administrator }) {
      const created = await identityGateway.createAdministrator({ companyId, ...administrator })
      const persisted = await repository.createFirstAdmin({
        companyId,
        issuer,
        subject: created.subject,
      })
      if (persisted === undefined) {
        throw new BootstrapUnavailableError('ALREADY_PROVISIONED')
      }

      return { companyId, subject: created.subject, userId: persisted.userId }
    },
  }
}

function assertAvailability(availability: BootstrapAvailability): void {
  if (availability.hasActiveCompanyAdmin) {
    throw new BootstrapUnavailableError('ALREADY_PROVISIONED')
  }
  if (!availability.companyExists) {
    throw new BootstrapUnavailableError('COMPANY_MISSING')
  }
}

function isConfiguredTokenValid(token: string | undefined): token is string {
  return token !== undefined && token.trim() !== ''
}

type MatchesConfiguredTokenParams = {
  readonly attemptedToken: string | undefined
  readonly configuredToken: string
}

/** Digests de tamanho fixo (sha256) evitam o branch de comprimento antes do `timingSafeEqual`. */
function matchesConfiguredToken({
  attemptedToken,
  configuredToken,
}: MatchesConfiguredTokenParams): boolean {
  const configuredDigest = createHash('sha256').update(configuredToken).digest()
  const attemptedDigest = createHash('sha256')
    .update(attemptedToken ?? '')
    .digest()
  return timingSafeEqual(configuredDigest, attemptedDigest)
}
