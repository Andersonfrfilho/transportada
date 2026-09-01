/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from './identity.schema'

export const LOCAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001'
export const LOCAL_KEYCLOAK_SUBJECT = '00000000-0000-4000-8000-000000000002'
export const LOCAL_IDENTITY_USER_ID = '00000000-0000-4000-8000-000000000003'
export const LOCAL_EXTERNAL_IDENTITY_ID = '00000000-0000-4000-8000-000000000004'
export const LOCAL_MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000005'
export const LOCAL_KEYCLOAK_ISSUER = 'http://localhost:58080/realms/transportada-local'
export const LOCAL_PROJECT_NAME = 'transportada'
export const LOCAL_IDENTITY_SEED_LOCK_ID = 14_014
/** Todos os papéis: o usuário local exercita qualquer feature sem trocar de conta. */
export const LOCAL_IDENTITY_ROLES = [
  'aggregate',
  'company-admin',
  'driver',
  'finance',
  'fiscal',
  'operator',
  'viewer',
] as const

/** O ator sintético do service account — ADR-0047 §1: um usuário do banco como qualquer outro. */
export const LOCAL_SERVICE_KEYCLOAK_SUBJECT = '00000000-0000-4000-8000-000000000009'
export const LOCAL_SERVICE_IDENTITY_USER_ID = '00000000-0000-4000-8000-000000000006'
export const LOCAL_SERVICE_EXTERNAL_IDENTITY_ID = '00000000-0000-4000-8000-000000000007'
export const LOCAL_SERVICE_MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000008'

export type LocalSeedActor = {
  readonly externalIdentityId: string
  readonly membershipId: string
  readonly roles: readonly CompanyRole[]
  readonly subject: string
  readonly userId: string
}

/**
 * ADR-0047 §3: o serviço só alcança as empresas onde a membership sintética existe. Localmente é
 * uma; numa instalação real ela é provisionada por empresa, e é essa lista que limita o estrago de
 * um segredo vazado.
 */
export const LOCAL_SEED_ACTORS: readonly LocalSeedActor[] = [
  {
    externalIdentityId: LOCAL_EXTERNAL_IDENTITY_ID,
    membershipId: LOCAL_MEMBERSHIP_ID,
    roles: LOCAL_IDENTITY_ROLES,
    subject: LOCAL_KEYCLOAK_SUBJECT,
    userId: LOCAL_IDENTITY_USER_ID,
  },
  {
    externalIdentityId: LOCAL_SERVICE_EXTERNAL_IDENTITY_ID,
    membershipId: LOCAL_SERVICE_MEMBERSHIP_ID,
    roles: ['automation'],
    subject: LOCAL_SERVICE_KEYCLOAK_SUBJECT,
    userId: LOCAL_SERVICE_IDENTITY_USER_ID,
  },
]
