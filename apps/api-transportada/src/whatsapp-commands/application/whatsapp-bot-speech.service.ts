/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'

import type { BotSpeechKey, BotSpeechParams } from '../domain/whatsapp-bot-speech.constant.js'
import {
  interpolateBotSpeech,
  resolveBotSpeechTemplate,
} from '../domain/whatsapp-bot-speech.policy.js'
import type { WhatsAppFlowGraphModulePort } from './whatsapp-flow-graph-publisher.port.js'

export type WhatsAppBotSpeechPort = {
  text: (input: {
    readonly companyId: string
    readonly key: BotSpeechKey
    readonly params?: BotSpeechParams
  }) => Promise<string>
}

/** Só o padrão do código — testes e instalações sem o grafo publicado. */
export const CATALOG_BOT_SPEECH: WhatsAppBotSpeechPort = {
  text: async ({ key, params }) =>
    interpolateBotSpeech(resolveBotSpeechTemplate(undefined, key), params),
}

/**
 * Lê a fala do grafo raiz **publicado** da empresa (a mesma linha que o editor de fluxos salva), a
 * cada mensagem: editou, valeu na próxima. Falha de leitura nunca deixa o bot mudo — cai no padrão.
 */
export function createGraphBotSpeech(input: {
  readonly onReadError?: (error: unknown) => void
  readonly repository: Pick<WhatsAppFlowGraphModulePort, 'get'>
  readonly rootFlowKey: string
}): WhatsAppBotSpeechPort {
  return {
    text: async ({ companyId, key, params }) => {
      const graph = await input.repository.get(companyId, input.rootFlowKey).catch((error) => {
        input.onReadError?.(error)
        return undefined
      })
      return interpolateBotSpeech(resolveBotSpeechTemplate(graph, key), params)
    },
  }
}

export async function sendBotSpeech(input: {
  readonly channel: Pick<ChannelAdapterInterface, 'sendText'>
  readonly companyId: string
  readonly key: BotSpeechKey
  readonly params?: BotSpeechParams
  readonly speech: WhatsAppBotSpeechPort
  readonly to: string
}): Promise<void> {
  const body = await input.speech.text({
    companyId: input.companyId,
    key: input.key,
    ...(input.params === undefined ? {} : { params: input.params }),
  })
  await input.channel.sendText(input.to, body)
}

/** Uma fala já decidida: chave do catálogo, ou texto pronto que veio de uma política de outro módulo. */
export type BotSpeechLine = (
  | { readonly key: BotSpeechKey; readonly params?: BotSpeechParams }
  | { readonly text: string }
) & {
  /** Linhas que a resposta leva depois da fala principal (spec 294: "marquei junto", oferta, avisos). */
  readonly after?: readonly string[]
}

const withAfter = (body: string, after: readonly string[] | undefined): string =>
  after === undefined || after.length === 0 ? body : [body, ...after].join('\n')

type BotSpeechContext = {
  readonly actor: { readonly scope: { readonly companyId: string } }
  readonly channel: Pick<ChannelAdapterInterface, 'sendText'>
  readonly session: { readonly whatsappNumber: string }
}

/** O `say` das ações: fala pela chave (ou pela linha pronta) para o número da sessão, na empresa do ator. */
export function createBotSayer(speech: WhatsAppBotSpeechPort) {
  return async function say(
    context: BotSpeechContext,
    line: BotSpeechKey | BotSpeechLine,
    params?: BotSpeechParams,
  ): Promise<void> {
    const resolved: BotSpeechLine =
      typeof line === 'string' ? { key: line, ...(params === undefined ? {} : { params }) } : line
    if ('text' in resolved) {
      await context.channel.sendText(
        context.session.whatsappNumber,
        withAfter(resolved.text, resolved.after),
      )
      return
    }
    const body = await speech.text({
      companyId: context.actor.scope.companyId,
      key: resolved.key,
      ...(resolved.params === undefined ? {} : { params: resolved.params }),
    })
    await context.channel.sendText(context.session.whatsappNumber, withAfter(body, resolved.after))
  }
}

/**
 * Spec 293 T11: a linha já decidida vira texto, para quem não fala pelo `say` (o grupo do motorista
 * junta as respostas e as manda pela fila do Evolution).
 */
export async function renderBotSpeechLine(input: {
  readonly companyId: string
  readonly line: BotSpeechLine
  readonly speech: WhatsAppBotSpeechPort
}): Promise<string> {
  if ('text' in input.line) return withAfter(input.line.text, input.line.after)
  const body = await input.speech.text({
    companyId: input.companyId,
    key: input.line.key,
    ...(input.line.params === undefined ? {} : { params: input.line.params }),
  })
  return withAfter(body, input.line.after)
}
