/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import {
  ContractorMailCredentialUnavailableError,
  ContractorMailWebhookSecretFormatError,
} from '../domain/contractor-mail.error.js'

const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

/** O formato do Svix (ADR-0063 §7) — o segredo que o Resend gera para assinar o webhook. */
const WEBHOOK_SIGNING_SECRET_PREFIX = 'whsec_'
const MAX_SECRET_LENGTH = 500

const envelopeSchema = z
  .object({
    algorithm: z.literal('A256GCM'),
    ciphertext: z.string().min(1),
    keyId: z.string().min(1),
    nonce: z.string().min(1),
    version: z.literal(1),
  })
  .strict()

const secretSchema = z
  .object({
    apiKey: z.string().min(1).max(MAX_SECRET_LENGTH),
    webhookSigningSecret: z
      .string()
      .min(1)
      .max(MAX_SECRET_LENGTH)
      .startsWith(WEBHOOK_SIGNING_SECRET_PREFIX),
  })
  .strict()

export type ContractorMailCredentialSecret = {
  readonly apiKey: string
  readonly webhookSigningSecret: string
}

export type ContractorMailCredentialScope = {
  readonly companyId: string
  readonly settingsId: string
}

export type ContractorMailCredentialSecretService = {
  decrypt(
    input: ContractorMailCredentialScope & { readonly envelope: SecretEnvelopeV1 },
  ): Promise<ContractorMailCredentialSecret>
  encrypt(
    input: ContractorMailCredentialScope & ContractorMailCredentialSecret,
  ): Promise<SecretEnvelopeV1>
}

/**
 * Spec 143 T006: a chave do Resend e o segredo de assinatura do webhook selados por empresa, no
 * mesmo desenho da credencial da Nota RP (`nfse-profiles/application/nfse-credential-secret.service.ts`).
 *
 * O AAD amarra o envelope à **linha de configuração**:
 * `transportada:contractor-mail-credential:v1:${companyId}:${settingsId}`. Envelope copiado para
 * outra empresa — ou para outra configuração da mesma — não abre, mesmo com a chave certa.
 */
export function createContractorMailCredentialSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): ContractorMailCredentialSecretService {
  return {
    decrypt: (request) => decryptSecret({ input: request, provider: input.envelopeProvider }),
    encrypt: (request) => encryptSecret({ input: request, provider: input.envelopeProvider }),
  }
}

async function encryptSecret(params: {
  readonly input: ContractorMailCredentialScope & ContractorMailCredentialSecret
  readonly provider: SecretEnvelopeProvider
}): Promise<SecretEnvelopeV1> {
  const { input, provider } = params
  /**
   * Recusado **antes** de qualquer criptografia: um segredo colado errado (sem o `whsec_` do Svix)
   * só se revelaria na primeira tentativa de conferir a assinatura do webhook, muito depois de
   * gravado. Isso não é o mesmo defeito que uma falha do cofre, então não vira a mesma resposta.
   */
  if (!input.webhookSigningSecret.startsWith(WEBHOOK_SIGNING_SECRET_PREFIX)) {
    throw new ContractorMailWebhookSecretFormatError()
  }

  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    plaintext = encodeSecret(input)
    const envelope = await provider.encrypt({ additionalAuthenticatedData, plaintext })
    return envelopeSchema.parse(envelope)
  } catch {
    throw new ContractorMailCredentialUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

async function decryptSecret(params: {
  readonly input: ContractorMailCredentialScope & { readonly envelope: SecretEnvelopeV1 }
  readonly provider: SecretEnvelopeProvider
}): Promise<ContractorMailCredentialSecret> {
  const { input, provider } = params
  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    plaintext = await provider.decrypt({ additionalAuthenticatedData, envelope: input.envelope })
    return parseSecret(plaintext)
  } catch {
    throw new ContractorMailCredentialUnavailableError()
  } finally {
    plaintext?.fill(0)
    additionalAuthenticatedData.fill(0)
  }
}

function createAdditionalAuthenticatedData(input: ContractorMailCredentialScope): Uint8Array {
  return TEXT_ENCODER.encode(
    `transportada:contractor-mail-credential:v1:${input.companyId}:${input.settingsId}`,
  )
}

function encodeSecret(input: ContractorMailCredentialSecret): Uint8Array {
  return TEXT_ENCODER.encode(
    JSON.stringify({ apiKey: input.apiKey, webhookSigningSecret: input.webhookSigningSecret }),
  )
}

function parseSecret(plaintext: Uint8Array): ContractorMailCredentialSecret {
  const parsed = secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)) as unknown)
  return { apiKey: parsed.apiKey, webhookSigningSecret: parsed.webhookSigningSecret }
}
