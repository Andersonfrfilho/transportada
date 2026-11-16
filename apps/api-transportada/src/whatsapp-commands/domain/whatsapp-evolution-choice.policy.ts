/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { WhatsAppChoiceOption } from '../application/whatsapp-command-driver.port.js'

/**
 * O Evolution (WhatsApp Web) não tem lista nem botão: o assistente do escritório, escrito para a Meta, manda
 * escolhas como lista. Aqui cada escolha vira texto numerado e a resposta digitada volta a ser o id da linha.
 * Funções puras; quem lembra as linhas oferecidas é o canal.
 */
const REPLY_HINT = '_Responda com o número._'

export function renderEvolutionChoice(input: {
  readonly body: string
  readonly options: readonly WhatsAppChoiceOption[]
}): string {
  const lines = input.options.map((option, index) => `*${index + 1}* - ${option.title}`)
  return [input.body, '', ...lines, '', REPLY_HINT].join('\n')
}

function normalizeTitle(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * O número da opção, ou o nome dela (sem ícone nem acento), vira o id da linha. Sem correspondência
 * (valor, texto livre, número fora da lista) volta `undefined`: o texto segue como foi digitado.
 */
export function resolveEvolutionChoice(
  text: string,
  options: readonly WhatsAppChoiceOption[],
): string | undefined {
  const normalized = normalizeTitle(text)
  if (normalized === '') return undefined
  if (/^\d{1,2}$/u.test(normalized)) return options[Number(normalized) - 1]?.id
  return options.find((option) => normalizeTitle(option.title) === normalized)?.id
}
