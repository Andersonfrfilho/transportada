/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  createMetaWhatsAppModule,
  type NonceStoreInterface,
} from '@adatechnology/meta-whatsapp-module'

import type { WhatsAppChannelRepositoryPort } from './whatsapp-channel.port.js'
import type { WhatsAppChannelSecretService } from './whatsapp-channel-secret.service.js'

export type MetaWhatsAppModuleInstance = ReturnType<typeof createMetaWhatsAppModule>

export type ResolvedMetaWhatsAppModule = {
  readonly companyId: string
  readonly module: MetaWhatsAppModuleInstance
}

export type MetaWhatsAppModuleResolver = {
  /**
   * A empresa é descoberta **pelo número que a Meta diz ter recebido a mensagem**, não por um campo
   * de rota: o webhook é um endereço só para a instalação inteira, e `phone_number_id` é a única
   * coisa no corpo que amarra a entrega a uma empresa.
   */
  resolveByPhoneNumberId(phoneNumberId: string): Promise<ResolvedMetaWhatsAppModule | undefined>
}

export type CreateMetaWhatsAppModuleResolverParams = {
  readonly apiVersion: string
  readonly appSecret: string
  readonly baseUrl: string | undefined
  readonly database: unknown
  readonly nonceStore: NonceStoreInterface
  readonly repository: Pick<WhatsAppChannelRepositoryPort, 'findByPhoneNumberId'>
  readonly secretService: WhatsAppChannelSecretService
  readonly verifyToken: string
}

/**
 * Spec 062 T006 — **uma instância do módulo por empresa**, porque o módulo recebe a credencial na
 * construção e a credencial é por empresa. Ele não é barato de montar (repositórios, interpretador
 * de fluxo, adaptador de canal), então a instância fica guardada; a chave do cache carrega a
 * `version` da linha, e é isso que faz trocar o token no painel valer na entrega seguinte sem
 * restart e sem invalidação manual.
 *
 * ⚠️ **O cache guarda o token aberto, em memória, enquanto o processo viver.** É a mesma exposição
 * que qualquer credencial em uso tem, e o alternativo — abrir o envelope a cada entrega — trocaria
 * uma chamada ao chaveiro por mensagem recebida, que num fluxo de conversa é muito mais tráfego que
 * no envio de notificação da T004.
 */
export function createMetaWhatsAppModuleResolver(
  params: CreateMetaWhatsAppModuleResolverParams,
): MetaWhatsAppModuleResolver {
  const cache = new Map<string, ResolvedMetaWhatsAppModule>()

  return {
    async resolveByPhoneNumberId(phoneNumberId) {
      const channel = await params.repository.findByPhoneNumberId({ phoneNumberId })
      if (channel === undefined) return undefined

      const cacheKey = `${channel.channelId}:${channel.version}`
      const cached = cache.get(cacheKey)
      if (cached !== undefined) return cached

      const { accessToken } = await params.secretService.decrypt({
        channelId: channel.channelId,
        companyId: channel.companyId,
        envelope: channel.envelope,
      })
      const resolved: ResolvedMetaWhatsAppModule = {
        companyId: channel.companyId,
        module: createMetaWhatsAppModule({
          config: {
            accessToken,
            apiVersion: params.apiVersion,
            appSecret: params.appSecret,
            phoneNumberId: channel.phoneNumberId,
            webhookVerifyToken: params.verifyToken,
            ...(params.baseUrl === undefined ? {} : { baseUrl: params.baseUrl }),
            ...(channel.wabaId === '' ? {} : { wabaId: channel.wabaId }),
          },
          db: params.database as never,
          nonceStore: params.nonceStore,
        }),
      }
      /** Versão nova invalida sozinha: a chave muda, e a entrada velha morre no `clear` do teto. */
      if (cache.size > MAXIMUM_CACHED_MODULES) cache.clear()
      cache.set(cacheKey, resolved)

      return resolved
    },
  }
}

/**
 * Teto simples em vez de LRU: numa instalação dedicada o número de empresas é de uma dezena, e a
 * entrada só é substituída quando o token muda. Um LRU aqui seria estrutura para um problema que
 * esta instalação não tem.
 */
const MAXIMUM_CACHED_MODULES = 64
