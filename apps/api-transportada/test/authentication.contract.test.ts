/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, mock, test } from 'bun:test'
import { KEYCLOAK_JWT_ERROR_CODES, KeycloakJwtVerificationError } from '@adatechnology/keycloak-jwt'

import { parseEnvironment } from '../src/config/environment.schema'
import { AuthenticationService } from '../src/identity/application/authentication.service'
import type {
  AccessTokenVerifierPort,
  ExternalIdentityRepositoryPort,
} from '../src/identity/application/identity.port'
import { createKeycloakAccessTokenVerifier } from '../src/identity/infrastructure/keycloak-jwt.gateway'
import { ApiError } from '../src/shared/api.error'

const TOKEN = 'header.payload.signature'
const ISSUER = 'http://localhost:58080/realms/transportada-local'
const SUBJECT = 'keycloak-user-id'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const EXTERNAL_IDENTITY_ID = '00000000-0000-4000-8000-000000000003'

describe('authentication contract', () => {
  test('loads issuer, JWKS URI and audience only from trusted environment configuration', () => {
    const environment = parseEnvironment({
      APP_ENV: 'test',
      APP_PORT: '0',
      DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
      FRONTEND_ORIGIN: 'http://localhost:53000',
      KEYCLOAK_AUDIENCE: 'transportada-api',
      KEYCLOAK_ISSUER: ISSUER,
      KEYCLOAK_JWKS_URI: `${ISSUER}/protocol/openid-connect/certs`,
      LOG_LEVEL: 'error',
    })

    expect(environment.keycloak).toEqual({
      audience: 'transportada-api',
      issuer: ISSUER,
      jwksUri: `${ISSUER}/protocol/openid-connect/certs`,
    })
  })

  test.each([
    null,
    '',
    'Basic credentials',
    'Bearer',
    'Bearer token with-spaces',
    'Bearer first,Bearer second',
  ])('rejects an absent or malformed bearer credential with one safe 401', async (header) => {
    let verifierCalls = 0
    const service = createService({
      verifier: {
        async verify() {
          verifierCalls += 1
          throw new Error('must not be called')
        },
      },
    })

    const error = await captureError(() => service.authenticate(header))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
      status: 401,
    })
    if (header) {
      expect(JSON.stringify(error)).not.toContain(header)
    }
    expect(verifierCalls).toBe(0)
  })

  test('resolves only an active local identity by verified issuer and subject', async () => {
    const repositoryLookups: Array<{ readonly issuer: string; readonly subject: string }> = []
    const service = createService({
      repository: {
        async findActiveByIssuerAndSubject(input) {
          repositoryLookups.push(input)
          return {
            externalIdentityId: EXTERNAL_IDENTITY_ID,
            userId: USER_ID,
          }
        },
      },
    })

    const identity = await service.authenticate(`bearer ${TOKEN}`)

    expect(repositoryLookups).toEqual([{ issuer: ISSUER, subject: SUBJECT }])
    expect(identity).toEqual({
      companyIdClaim: COMPANY_ID,
      externalIdentityId: EXTERNAL_IDENTITY_ID,
      issuer: ISSUER,
      platformAdmin: false,
      subject: SUBJECT,
      userId: USER_ID,
    })
    expect(Object.isFrozen(identity)).toBe(true)
    expect(identity).not.toHaveProperty('roles')
    expect(identity).not.toHaveProperty('permissions')
  })

  test('accepts only the exact verified realm role as platform assignment', async () => {
    const exact = createService({
      verifier: verifiedTokenVerifier(COMPANY_ID, ['viewer', 'platform-admin']),
    })
    const lookalike = createService({
      verifier: verifiedTokenVerifier(COMPANY_ID, ['company-admin', 'platform-administrator']),
    })
    const clientRoleOnly = createService({
      verifier: verifiedTokenVerifier(COMPANY_ID, [], {
        resource_access: {
          'transportada-api': { roles: ['platform-admin'] },
        },
      }),
    })
    const malformed = createService({
      verifier: verifiedTokenVerifier(COMPANY_ID, 'platform-admin'),
    })

    await expect(exact.authenticate(`Bearer ${TOKEN}`)).resolves.toMatchObject({
      platformAdmin: true,
    })
    await expect(lookalike.authenticate(`Bearer ${TOKEN}`)).resolves.toMatchObject({
      platformAdmin: false,
    })
    await expect(clientRoleOnly.authenticate(`Bearer ${TOKEN}`)).resolves.toMatchObject({
      platformAdmin: false,
    })
    await expect(malformed.authenticate(`Bearer ${TOKEN}`)).resolves.toMatchObject({
      platformAdmin: false,
    })
  })

  test('requires company_id to be one UUID without creating tenant context', async () => {
    let repositoryCalls = 0
    const repository: ExternalIdentityRepositoryPort = {
      async findActiveByIssuerAndSubject() {
        repositoryCalls += 1
        return {
          externalIdentityId: EXTERNAL_IDENTITY_ID,
          userId: USER_ID,
        }
      },
    }

    for (const companyIdClaim of [undefined, '', 'company-from-client']) {
      const service = createService({
        repository,
        verifier: verifiedTokenVerifier(companyIdClaim),
      })
      const error = await captureError(() => service.authenticate(`Bearer ${TOKEN}`))

      expect(error).toMatchObject({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        status: 401,
      })
    }

    expect(repositoryCalls).toBe(0)
  })

  test('reduces every typed provider rejection and unknown identities to the same safe 401', async () => {
    const missingIdentityService = createService({
      repository: {
        async findActiveByIssuerAndSubject() {
          return null
        },
      },
    })

    const missingIdentityError = await captureError(() =>
      missingIdentityService.authenticate(`Bearer ${TOKEN}`),
    )
    const errors: unknown[] = [missingIdentityError]

    for (const code of KEYCLOAK_JWT_ERROR_CODES) {
      const gateway = createKeycloakAccessTokenVerifier(
        {
          audience: 'transportada-api',
          issuer: ISSUER,
          jwksUri: `${ISSUER}/protocol/openid-connect/certs`,
        },
        {
          createVerifier() {
            return {
              getJwksStatus: () => ({
                coolingDown: false,
                fresh: false,
                hasUsableCachedKey: false,
                reloading: false,
              }),
              async verify() {
                throw new KeycloakJwtVerificationError(code)
              },
            }
          },
        },
      )
      const service = createService({ verifier: gateway })
      errors.push(await captureError(() => service.authenticate(`Bearer ${TOKEN}`)))
    }

    for (const error of errors) {
      expect(error).toMatchObject({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
        status: 401,
      })
      expect(error).not.toHaveProperty('cause')
      expect(String(error)).not.toContain(TOKEN)
      expect(JSON.stringify(error)).not.toContain(TOKEN)
    }
  })

  test('does not disguise an unexpected verifier failure as invalid credentials', async () => {
    const unexpected = new Error('verifier implementation unavailable')
    const service = createService({
      verifier: {
        async verify() {
          throw unexpected
        },
      },
    })

    await expect(service.authenticate(`Bearer ${TOKEN}`)).rejects.toBe(unexpected)
  })

  test('configures the Ada verifier from trusted values and requires company_id', async () => {
    let receivedConfig: unknown
    const verify = mock(async () => ({
      audience: 'transportada-api',
      claims: { company_id: COMPANY_ID },
      expiresAt: 1_800_000_000,
      issuer: ISSUER,
      subject: SUBJECT,
    }))
    const gateway = createKeycloakAccessTokenVerifier(
      {
        audience: 'transportada-api',
        issuer: ISSUER,
        jwksUri: `${ISSUER}/protocol/openid-connect/certs`,
      },
      {
        createVerifier(config) {
          receivedConfig = config
          return {
            getJwksStatus: () => ({
              coolingDown: false,
              fresh: true,
              hasUsableCachedKey: true,
              reloading: false,
            }),
            verify,
          }
        },
      },
    )

    await expect(gateway.verify(TOKEN)).resolves.toMatchObject({
      claims: { company_id: COMPANY_ID },
      issuer: ISSUER,
      subject: SUBJECT,
    })
    expect(verify).toHaveBeenCalledWith(TOKEN)
    expect(receivedConfig).toEqual({
      algorithms: ['RS256'],
      audience: 'transportada-api',
      issuer: ISSUER,
      jwksUri: `${ISSUER}/protocol/openid-connect/certs`,
      requiredClaims: ['company_id'],
    })
  })
})

type CreateServiceParams = {
  readonly repository?: ExternalIdentityRepositoryPort
  readonly verifier?: AccessTokenVerifierPort
}

function createService({
  repository = {
    async findActiveByIssuerAndSubject() {
      return {
        externalIdentityId: EXTERNAL_IDENTITY_ID,
        userId: USER_ID,
      }
    },
  },
  verifier = verifiedTokenVerifier(COMPANY_ID),
}: CreateServiceParams = {}): AuthenticationService {
  return new AuthenticationService({ repository, verifier })
}

function verifiedTokenVerifier(
  companyIdClaim: unknown,
  realmRoles: unknown = ['company-admin', 'fiscal'],
  additionalClaims: Readonly<Record<string, unknown>> = {},
): AccessTokenVerifierPort {
  return {
    async verify(token) {
      expect(token).toBe(TOKEN)
      return {
        audience: 'transportada-api',
        claims: {
          ...additionalClaims,
          company_id: companyIdClaim,
          iss: 'https://untrusted-claim.example',
          realm_access: { roles: realmRoles },
          sub: 'untrusted-claim-subject',
        },
        expiresAt: 1_800_000_000,
        issuer: ISSUER,
        subject: SUBJECT,
      }
    },
  }
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error: unknown) {
    return error
  }

  throw new Error('Expected operation to fail')
}
