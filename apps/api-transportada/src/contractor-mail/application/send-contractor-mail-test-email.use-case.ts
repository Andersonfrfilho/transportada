/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import {
  ContractorMailTestRecipientUnavailableError,
  createMailSendReadinessError,
} from '../domain/contractor-mail.error.js'
import { resolveMailSendReadiness } from '../domain/mail-send-readiness.policy.js'
import { deriveReplyToken, hashReplyToken } from '../domain/reply-token.policy.js'
import type { ActorEmailResolver } from '../infrastructure/actor-email.repository.js'
import type { ContractorMailCredentialSecretService } from './contractor-mail-credential-secret.service.js'
import type { ContractorMailRepositoryPort } from './contractor-mail.port.js'

/**
 * `contractor_mail_messages.subject` não deriva mais do `subject_type` da conversa no worker (a fila
 * deixou de carregar dado — correção pós-entrega da T009): quem cria a mensagem grava o assunto que
 * ela terá. Para o e-mail de teste é sempre este — literal, único uso, sem tabela nem `subject_type`
 * dinâmico envolvidos.
 */
const CONTRACTOR_MAIL_TEST_EMAIL_SUBJECT = 'Teste de configuração de e-mail com contratantes'

export type SendContractorMailTestEmailContext = {
  readonly companyId: string
  readonly userId: string
}

export type SendContractorMailTestEmailInput = {
  readonly context: SendContractorMailTestEmailContext
  readonly correlationId: string
}

export type SendContractorMailTestEmailResult = {
  readonly threadId: string
}

export type SendContractorMailTestEmailUseCase = {
  execute(input: SendContractorMailTestEmailInput): Promise<SendContractorMailTestEmailResult>
}

/**
 * Spec 143 T009 (P0, RF13), corrigido para RF7: o destinatário é o e-mail do administrador
 * autenticado — lido do contexto, nunca do corpo —, e a conversa `setup_test` nunca decide nada.
 *
 * O token de resposta é **derivado**, não gerado à toa: precisa do `threadId` definitivo (por isso
 * `reserveSetupTestThread` roda antes de qualquer cálculo de token que valha), do `replyTokenSecret`
 * selado na configuração e do `companyId`. Reenviar o teste na mesma conversa produz o **mesmo**
 * `Reply-To` — é isso que faz RF7 valer também para este e-mail.
 */
export function createSendContractorMailTestEmailUseCase(dependencies: {
  readonly actorEmailResolver: ActorEmailResolver
  readonly repository: ContractorMailRepositoryPort
  readonly secretService: ContractorMailCredentialSecretService
}): SendContractorMailTestEmailUseCase {
  return {
    async execute({ context, correlationId }) {
      const readiness = resolveMailSendReadiness({
        settings: await dependencies.repository.findSettings({ companyId: context.companyId }),
      })
      if (!readiness.ready) throw createMailSendReadinessError(readiness.reason)
      const { settings } = readiness

      const recipientEmail = await dependencies.actorEmailResolver.resolve({
        companyId: context.companyId,
        userId: context.userId,
      })
      if (recipientEmail === undefined) throw new ContractorMailTestRecipientUnavailableError()

      const secret = await dependencies.secretService.decrypt({
        companyId: settings.companyId,
        envelope: settings.secretEnvelope as SecretEnvelopeV1,
        settingsId: settings.id,
      })

      /**
       * O único motivo de derivar o token aqui é calcular o hash para tentar reservar a conversa —
       * se a reserva perder a corrida, a conversa vencedora já tem o hash dela própria, e nada mais
       * depende do token candidato. O `Reply-To` de fato só é montado pelo worker, no envio, a
       * partir da mesma configuração — ele deriva o token de novo, para o `threadId` confirmado, sem
       * que este texto plano precise atravessar o outbox ou a fila.
       */
      const candidateThreadId = crypto.randomUUID()
      const candidateToken = deriveReplyToken({
        companyId: context.companyId,
        replyTokenSecret: secret.replyTokenSecret,
        threadId: candidateThreadId,
      })
      const { threadId } = await dependencies.repository.reserveSetupTestThread({
        candidateReplyTokenHash: hashReplyToken(candidateToken),
        candidateThreadId,
        companyId: context.companyId,
      })

      const result = await dependencies.repository.recordTestEmailMessage({
        actorUserId: context.userId,
        bodyText: buildContractorMailTestEmailBody({ senderName: settings.senderName }),
        companyId: context.companyId,
        correlationId,
        fromAddress: settings.senderAddress,
        subject: CONTRACTOR_MAIL_TEST_EMAIL_SUBJECT,
        threadId,
        toAddresses: [recipientEmail],
      })

      return { threadId: result.threadId }
    },
  }
}

/**
 * Texto simples, sem PII além do nome do remetente configurado (Objetivo, item 3). Pura e exportada
 * para o teste conferir a cópia sem passar pela transação inteira.
 */
export function buildContractorMailTestEmailBody(input: { readonly senderName: string }): string {
  return [
    `Este é um e-mail de teste do sistema de e-mail com contratantes de ${input.senderName}.`,
    '',
    'Para concluir a verificação, responda a esta mensagem com qualquer texto. A resposta confirma',
    'que o e-mail foi entregue e que a assinatura DKIM do seu provedor de e-mail está alinhada.',
  ].join('\n')
}
