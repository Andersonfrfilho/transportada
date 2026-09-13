/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

/**
 * Cópia por valor do serviço da API
 * (`contractor-mail/application/contractor-mail-credential-secret.service.ts`) — as apps não
 * importam código uma da outra. O AAD tem de ser **idêntico** ao usado ao selar, ou a abertura
 * falha: `transportada:contractor-mail-credential:v1:${companyId}:${settingsId}`.
 *
 * O worker só **abre**: quem sela é a rota de configuração, na API. `apiKey` autentica o envio pelo
 * gateway do Resend; `webhookSigningSecret` confere a assinatura Svix do webhook de entrada, na
 * própria API — o worker o abre porque é ele quem processa o e-mail recebido depois do webhook.
 */

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
    input: ContractorMailCredentialScope & { readonly envelope: unknown },
  ): Promise<ContractorMailCredentialSecret>
}

export function createContractorMailCredentialSecretService(input: {
  readonly envelopeProvider: SecretEnvelopeProvider
}): ContractorMailCredentialSecretService {
  return {
    decrypt: (request) => decryptSecret({ input: request, provider: input.envelopeProvider }),
  }
}

async function decryptSecret(params: {
  readonly input: ContractorMailCredentialScope & { readonly envelope: unknown }
  readonly provider: SecretEnvelopeProvider
}): Promise<ContractorMailCredentialSecret> {
  const { input, provider } = params
  const envelope = envelopeSchema.parse(input.envelope) as SecretEnvelopeV1
  const additionalAuthenticatedData = createAdditionalAuthenticatedData(input)
  let plaintext: Uint8Array | undefined
  try {
    plaintext = await provider.decrypt({ additionalAuthenticatedData, envelope })
    return parseSecret(plaintext)
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

function parseSecret(plaintext: Uint8Array): ContractorMailCredentialSecret {
  const parsed = secretSchema.parse(JSON.parse(TEXT_DECODER.decode(plaintext)) as unknown)
  return { apiKey: parsed.apiKey, webhookSigningSecret: parsed.webhookSigningSecret }
}
