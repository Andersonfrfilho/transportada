/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
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
  'company-admin',
  'driver',
  'finance',
  'fiscal',
  'operator',
  'viewer',
] as const
