/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318 (T6): por onde o aviso automático da ocorrência chega à contratante — ler, trocar, listar os grupos do
 * Evolution com o dono de cada um e mandar uma mensagem de teste ao grupo.
 *
 * - Sem linha gravada, a contratante está no e-mail (o padrão de hoje, `emailFallback` ligado).
 * - Voltar ao e-mail limpa grupo e número: o grupo fica livre para outro dono (RF5).
 * - O teste usa o mesmo modelo e a mesma marca do aviso, com valores de exemplo; nada vai a log.
 */
import type { EvolutionGroup } from '../../whatsapp/application/whatsapp-evolution.port.js'
import { buildContractorOccurrenceGroupMessage } from '../domain/contractor-occurrence-group.policy.js'
import {
  ContractorOccurrenceGroupNotConfiguredError,
  ContractorOccurrenceGroupTemplateMissingError,
  ContractorOccurrenceGroupTestFailedError,
} from '../domain/contractor-occurrence-channel.error.js'
import { ContractorReplyWhatsAppSendError } from './forward-contractor-reply-by-whatsapp.port.js'

export type ContractorOccurrenceChannelKind = 'email' | 'whatsapp_group'

export type ContractorOccurrenceChannelView = {
  readonly channel: ContractorOccurrenceChannelKind
  readonly emailFallback: boolean
  readonly groupJid: null | string
  readonly groupName: string
  readonly mentionPhone: null | string
  /** `null` enquanto nada foi gravado (a contratante segue no e-mail). */
  readonly updatedAt: null | string
}

export type ContractorOccurrenceChannelSettings =
  | { readonly channel: 'email'; readonly emailFallback: boolean }
  | {
      readonly channel: 'whatsapp_group'
      readonly emailFallback: boolean
      readonly groupJid: string
      readonly groupName: string
      readonly mentionPhone: string
    }

export type ContractorOccurrenceChannelActor = {
  readonly actorUserId: string
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
}

/** O dono de um grupo na empresa: um motorista (spec 292) ou uma contratante (spec 318). */
export type WhatsappGroupOwner = {
  readonly groupJid: string
  readonly id: string
  readonly kind: 'contractor' | 'driver'
  readonly name: string
}

export type ContractorOccurrenceChannelRepositoryPort = {
  /** `ContractorNotFoundError` com a contratante de outra empresa ou inexistente. */
  find(input: {
    readonly companyId: string
    readonly contractorId: string
  }): Promise<ContractorOccurrenceChannelView>
  listOwners(input: { readonly companyId: string }): Promise<readonly WhatsappGroupOwner[]>
  /** O modelo geral do aviso no grupo (canal `whatsapp`), ou `null`. */
  readGroupTemplate(input: { readonly companyId: string }): Promise<null | string>
  /**
   * Grava o canal e audita na mesma transação. `ContractorOccurrenceGroupTakenError` com o grupo de um motorista ou
   * de outra contratante, também sob concorrência.
   */
  save(
    input: ContractorOccurrenceChannelActor & ContractorOccurrenceChannelSettings,
  ): Promise<ContractorOccurrenceChannelView>
}

export type ContractorOccurrenceGroupOption = {
  readonly groupJid: string
  readonly name: string
  readonly owner: null | {
    readonly id: string
    readonly kind: 'contractor' | 'driver'
    readonly name: string
  }
}

const TEST_HEADER = '🧪 *Mensagem de teste do aviso de ocorrência*'

export function createContractorOccurrenceChannelUseCase(dependencies: {
  readonly listEvolutionGroups: (input: {
    readonly companyId: string
  }) => Promise<readonly EvolutionGroup[]>
  readonly now?: () => Date
  readonly repository: ContractorOccurrenceChannelRepositoryPort
  /** O Evolution da empresa; erro sobe como `ContractorReplyWhatsAppSendError`. */
  readonly sendGroupText: (input: {
    readonly body: string
    readonly companyId: string
    readonly groupJid: string
    readonly mentionNumber: string
  }) => Promise<unknown>
}) {
  const { repository } = dependencies
  return {
    get: (input: { readonly companyId: string; readonly contractorId: string }) =>
      repository.find(input),

    async listGroups(input: {
      readonly companyId: string
    }): Promise<readonly ContractorOccurrenceGroupOption[]> {
      const [groups, owners] = await Promise.all([
        dependencies.listEvolutionGroups(input),
        repository.listOwners(input),
      ])
      const byGroup = new Map(owners.map((owner) => [owner.groupJid, owner]))
      return groups.map((group) => {
        const owner = byGroup.get(group.groupJid)
        return {
          groupJid: group.groupJid,
          name: group.name,
          owner: owner === undefined ? null : { id: owner.id, kind: owner.kind, name: owner.name },
        }
      })
    },

    save: (input: ContractorOccurrenceChannelActor & ContractorOccurrenceChannelSettings) =>
      repository.save(input),

    async sendTest(input: {
      readonly companyId: string
      readonly contractorId: string
    }): Promise<{ readonly sent: true }> {
      const channel = await repository.find(input)
      if (
        channel.channel !== 'whatsapp_group' ||
        channel.groupJid === null ||
        channel.mentionPhone === null
      ) {
        throw new ContractorOccurrenceGroupNotConfiguredError()
      }
      const template = await repository.readGroupTemplate(input)
      if (template === null) throw new ContractorOccurrenceGroupTemplateMissingError()
      const moment = (dependencies.now ?? (() => new Date()))()
      const body = buildContractorOccurrenceGroupMessage({
        mentionPhone: channel.mentionPhone,
        template: `${TEST_HEADER}\n\n${template}`,
        values: {
          data: moment.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          momento: 'entrega',
          numeroNota: '000000',
          numeroNotaSemSerie: '000000',
          observacao: 'Exemplo de resumo da ocorrência.',
          tipoOcorrencia: 'Teste',
        },
      })
      try {
        await dependencies.sendGroupText({
          body,
          companyId: input.companyId,
          groupJid: channel.groupJid,
          mentionNumber: channel.mentionPhone,
        })
      } catch (error) {
        if (!(error instanceof ContractorReplyWhatsAppSendError)) {
          throw new ContractorOccurrenceGroupTestFailedError('failed')
        }
        throw new ContractorOccurrenceGroupTestFailedError(
          error.failure === 'number_not_found' ? 'group_not_found' : error.failure,
        )
      }
      return { sent: true }
    },
  }
}

export type ContractorOccurrenceChannelUseCase = ReturnType<
  typeof createContractorOccurrenceChannelUseCase
>
