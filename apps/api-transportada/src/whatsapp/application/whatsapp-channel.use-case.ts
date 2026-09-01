/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  WhatsAppChannelNotFoundError,
  WhatsAppChannelTokenRequiredError,
} from '../domain/whatsapp-channel.error.js'
import type {
  SaveWhatsAppChannelValues,
  WhatsAppChannelRepositoryPort,
  WhatsAppChannelSummary,
} from './whatsapp-channel.port.js'
import type { WhatsAppChannelSecretService } from './whatsapp-channel-secret.service.js'

export type WhatsAppChannelUseCase = {
  read(input: { readonly context: CompanyContext }): Promise<WhatsAppChannelSummary | null>
  remove(input: { readonly context: CompanyContext }): Promise<void>
  save(input: {
    readonly context: CompanyContext
    readonly values: SaveWhatsAppChannelValues
  }): Promise<WhatsAppChannelSummary>
}

export function createWhatsAppChannelUseCase(dependencies: {
  readonly repository: WhatsAppChannelRepositoryPort
  readonly secrets: WhatsAppChannelSecretService
  /** Injetado para o AAD ser testável: o id do canal entra no selo antes de a linha existir. */
  readonly newChannelId: () => string
}): WhatsAppChannelUseCase {
  return {
    async read({ context }) {
      return dependencies.repository.find({ companyId: context.companyId })
    },

    async remove({ context }) {
      const removed = await dependencies.repository.remove({ companyId: context.companyId })
      if (!removed) throw new WhatsAppChannelNotFoundError()
    },

    async save({ context, values }) {
      const existing = await dependencies.repository.find({ companyId: context.companyId })

      /**
       * ⚠️ **Cadastro novo exige token; atualização não.** Sem esta regra, salvar o número sem
       * reenviar o token gravaria envelope de string vazia e o canal falharia no primeiro envio —
       * com a tela mostrando "configurado", porque a linha existe.
       */
      if (existing === null && (values.accessToken ?? '') === '') {
        throw new WhatsAppChannelTokenRequiredError()
      }

      /**
       * O id do canal entra no AAD, e por isso ele é decidido **aqui**: o envelope é selado para a
       * linha, e a linha precisa nascer com o id que o selo prometeu. Atualização sem token novo
       * mantém o envelope antigo — daí `undefined`, que o repositório lê como "não mexa no segredo".
       */
      const channelId = existing?.id ?? dependencies.newChannelId()
      const secretEnvelope =
        (values.accessToken ?? '') === ''
          ? undefined
          : await dependencies.secrets.encrypt({
              accessToken: values.accessToken as string,
              channelId,
              companyId: context.companyId,
            })

      return dependencies.repository.save({
        companyId: context.companyId,
        displayPhoneNumber: values.displayPhoneNumber,
        phoneNumberId: values.phoneNumberId,
        secretEnvelope,
        status: values.status,
        wabaId: values.wabaId,
      })
    },
  }
}
