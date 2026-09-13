/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T010 (RF11): a rota pública conferiu o `webhookId` e leu o corpo cru; este caso de uso
 * decide se a assinatura é válida e, se for, o que fazer com o evento. **Nada do corpo entra aqui
 * antes de a assinatura ser conferida** (ADR-0063 §3): o `type` e o `data.email_id` só são lidos
 * depois de `verifySvixSignature` aprovar.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { z } from 'zod'

import {
  checkSvixHeadersAndWindow,
  verifySvixSignatureHmac,
} from '../domain/svix-signature.policy.js'
import type {
  ContractorMailRepositoryPort,
  ContractorMailSettingsRecord,
} from './contractor-mail.port.js'
import type { ContractorMailCredentialSecretService } from './contractor-mail-credential-secret.service.js'

const EMAIL_RECEIVED_EVENT_TYPE = 'email.received'

const inboundEmailWebhookBodySchema = z.object({
  data: z.object({ email_id: z.string().min(1) }),
  type: z.string().min(1),
})

export type ProcessInboundEmailWebhookInput = {
  readonly correlationId: string
  readonly rawBody: string
  readonly svixId: string
  readonly svixSignature: string
  readonly svixTimestamp: string
  readonly webhookId: string
}

export type ProcessInboundEmailWebhookResult = {
  readonly outcome: 'accepted' | 'ignored' | 'unauthorized'
}

export type ProcessInboundEmailWebhookUseCase = {
  execute(input: ProcessInboundEmailWebhookInput): Promise<ProcessInboundEmailWebhookResult>
}

export function createProcessInboundEmailWebhookUseCase(dependencies: {
  readonly now?: () => Date
  readonly repository: ContractorMailRepositoryPort
  readonly secretService: ContractorMailCredentialSecretService
}): ProcessInboundEmailWebhookUseCase {
  const now = dependencies.now ?? (() => new Date())

  return {
    async execute(input) {
      // Revisão do `architect`: rejeição barata primeiro — presença/formato dos cabeçalhos `svix-*`
      // e a janela de 5 minutos não pedem banco nem segredo nenhum. Um `POST` em rajada sem
      // assinatura de verdade (ou com timestamp velho repetido) nunca chega a `lookupSettings`.
      const precondition = checkSvixHeadersAndWindow({
        now: now(),
        svixId: input.svixId,
        svixSignature: input.svixSignature,
        svixTimestamp: input.svixTimestamp,
      })
      if (!precondition.verified) return { outcome: 'unauthorized' }

      const configuration = await lookupSettings(dependencies.repository, input.webhookId)
      if (configuration === undefined) return { outcome: 'unauthorized' }

      const secret = await openWebhookSecret({
        secretService: dependencies.secretService,
        settings: configuration,
      })
      if (secret === undefined) return { outcome: 'unauthorized' }

      const verification = verifySvixSignatureHmac({
        rawBody: input.rawBody,
        svixId: input.svixId,
        svixSignature: input.svixSignature,
        svixTimestamp: input.svixTimestamp,
        webhookSigningSecret: secret.webhookSigningSecret,
      })
      if (!verification.verified) return { outcome: 'unauthorized' }

      const parsedBody = parseBody(input.rawBody)
      if (parsedBody === undefined || parsedBody.type !== EMAIL_RECEIVED_EVENT_TYPE) {
        return { outcome: 'ignored' }
      }

      await dependencies.repository.recordInboundWebhookEvent({
        companyId: configuration.companyId,
        correlationId: input.correlationId,
        occurredAt: now(),
        providerEmailId: parsedBody.data.email_id,
      })
      return { outcome: 'accepted' }
    },
  }
}

async function lookupSettings(
  repository: ContractorMailRepositoryPort,
  webhookId: string,
): ReturnType<ContractorMailRepositoryPort['findSettingsByWebhookId']> {
  if (webhookId === '') return undefined
  return repository.findSettingsByWebhookId({ webhookId })
}

async function openWebhookSecret(input: {
  readonly secretService: ContractorMailCredentialSecretService
  readonly settings: ContractorMailSettingsRecord
}): Promise<{ readonly webhookSigningSecret: string } | undefined> {
  try {
    const secret = await input.secretService.decrypt({
      companyId: input.settings.companyId,
      envelope: input.settings.secretEnvelope as SecretEnvelopeV1,
      settingsId: input.settings.id,
    })
    return { webhookSigningSecret: secret.webhookSigningSecret }
  } catch {
    // O envelope não abrir (chave do keyring girada/perdida, dado corrompido) é fail-closed, como
    // configuração ausente: sem o segredo não há como confiar em assinatura nenhuma (RF11).
    return undefined
  }
}

function parseBody(rawBody: string): z.infer<typeof inboundEmailWebhookBodySchema> | undefined {
  try {
    const parsed = inboundEmailWebhookBodySchema.safeParse(JSON.parse(rawBody) as unknown)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
