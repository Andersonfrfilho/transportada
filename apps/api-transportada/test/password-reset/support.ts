/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type {
  ActiveResetTarget,
  CreatePasswordResetInput,
  PasswordResetDeliveryOutboxPort,
  PasswordResetRepositoryPort,
} from '../../src/identity/application/password-reset.port.js'
import type { PasswordResetSnapshot } from '../../src/identity/domain/password-reset.policy.js'

/** Valores sintéticos: nenhum código, senha ou contato real entra em fixture, log ou evidência. */
export const RESET_USERNAME = 'usuario.sintetico.de.contrato'
export const RESET_PASSWORD = 'Senha-sintetica-de-contrato-9'
export const RESET_CODE = 'a1b2c3d4e5f60718'

export const COMPANY_ALPHA = '3f1d0b6e-2f6f-4a1e-9a4a-0a1a2b3c4d5e'
export const COMPANY_BETA = '5a2e1c7f-3a70-4b2f-8b5b-1b2c3d4e5f60'
export const USER_ID = 'b4f0c6a2-8d33-4a76-9d7b-1f2e3a4b5c6d'

export const sealedCodeStub = (): SecretEnvelopeV1 =>
  ({
    algorithm: 'aes-256-gcm',
    ciphertext: 'c2ludGV0aWNv',
    iv: 'aXY=',
    keyId: 'contract',
    tag: 'dGFn',
    version: 1,
  }) as unknown as SecretEnvelopeV1

export type OutboxCall = Parameters<PasswordResetDeliveryOutboxPort['save']>[0]

export type RepositoryFake = PasswordResetRepositoryPort & {
  readonly consumed: { readonly companyId: string; readonly requestId: string }[]
  readonly created: CreatePasswordResetInput[]
  readonly failedAttempts: string[]
}

type RepositoryFakeParams = {
  readonly request?: PasswordResetSnapshot | undefined
  readonly targets?: readonly ActiveResetTarget[]
}

export function createRepositoryFake({
  request,
  targets = [],
}: RepositoryFakeParams = {}): RepositoryFake {
  const consumed: { readonly companyId: string; readonly requestId: string }[] = []
  const created: CreatePasswordResetInput[] = []
  const failedAttempts: string[] = []

  return {
    consumed,
    created,
    async create(input) {
      created.push(input)
    },
    failedAttempts,
    async findActiveTargets() {
      return targets
    },
    async findByCodeHash() {
      return request
    },
    async markConsumed({ companyId, requestId }) {
      consumed.push({ companyId, requestId })
    },
    async registerFailedAttempt({ requestId }) {
      failedAttempts.push(requestId)
    },
  }
}

export function createOutboxFake(): PasswordResetDeliveryOutboxPort & {
  readonly calls: OutboxCall[]
} {
  const calls: OutboxCall[] = []

  return {
    calls,
    async save(input) {
      calls.push(input)
    },
  }
}

export const envelopeProviderStub = {
  async encrypt(): Promise<SecretEnvelopeV1> {
    return sealedCodeStub()
  },
}
