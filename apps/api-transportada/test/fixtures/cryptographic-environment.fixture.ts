/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const ACTIVE_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64')
export const PREVIOUS_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString('base64')
export const IDEMPOTENCY_HMAC_KEY = Buffer.alloc(32, 3).toString('base64')

export const CRYPTOGRAPHIC_ENVIRONMENT = {
  ENCRYPTION_ACTIVE_KEY_ID: 'local-v2',
  ENCRYPTION_KEYRING_JSON: JSON.stringify({
    'local-v1': PREVIOUS_ENCRYPTION_KEY,
    'local-v2': ACTIVE_ENCRYPTION_KEY,
  }),
  IDEMPOTENCY_HMAC_KEY,
} as const

export const CRYPTOGRAPHIC_CONFIGURATION = {
  envelopeKeyRing: {
    activeKeyId: CRYPTOGRAPHIC_ENVIRONMENT.ENCRYPTION_ACTIVE_KEY_ID,
    keys: {
      'local-v1': Uint8Array.from(Buffer.from(PREVIOUS_ENCRYPTION_KEY, 'base64')),
      'local-v2': Uint8Array.from(Buffer.from(ACTIVE_ENCRYPTION_KEY, 'base64')),
    },
  },
  idempotencyHmacKey: Uint8Array.from(Buffer.from(IDEMPOTENCY_HMAC_KEY, 'base64')),
} as const

export const API_ENVIRONMENT = {
  APP_ENV: 'test',
  APP_PORT: '0',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  FRONTEND_ORIGIN: 'http://localhost:53000',
  KEYCLOAK_AUDIENCE: 'transportada-api',
  KEYCLOAK_ISSUER: 'https://identity.example.test/realms/transportada',
  KEYCLOAK_JWKS_URI: 'https://identity.example.test/realms/transportada/certs',
  LOG_LEVEL: 'error',
  ...CRYPTOGRAPHIC_ENVIRONMENT,
} as const
