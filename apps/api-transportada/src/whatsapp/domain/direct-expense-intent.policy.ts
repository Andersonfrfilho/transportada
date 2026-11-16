/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Quem tem `expenses.manage` e também é motorista cai, no 1:1, no fluxo do motorista. A mensagem vai ao assistente do
 * escritório (que oferece "Lançar conta" e "Minha viagem") quando fala de conta ou quando só abre a conversa
 * ("oi", "menu"): sem isso o financeiro que também é motorista nunca via a opção de contas, porque só a palavra
 * "conta" desviava.
 *
 * Função pura sobre o texto. "baixa" sozinha fica de fora: o motorista também dá baixa na entrega.
 */
const FINANCE_WORDS = /\b(contas?|boletos?|pagar|pagamentos?|lancar|despesas?|financeiro)\b/u
const OPENING_WORDS =
  /^(oi+|ola+|menu|opcoes?|ajuda|bom dia|boa tarde|boa noite|e ai|eai|inicio|comecar)$/u

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * O motorista que também lança conta: só a frase que fala de conta desvia, e mais estreita que acima — "boleto" sozinho
 * é a ocorrência de prorrogação, e "lançar" sozinho é o menu do motorista ("lançar a entrega").
 */
const DRIVER_FINANCE_WORDS =
  /\b(contas?|despesas?|financeiro)\b|\b(lancar|pagar|cadastrar)\s+(um\s+|uma\s+)?boletos?\b/u

export function isDriverFinanceIntent(text: string): boolean {
  return DRIVER_FINANCE_WORDS.test(normalize(text))
}

export function isDirectExpenseIntent(text: string): boolean {
  const normalized = normalize(text)
  if (normalized === '') return false
  return FINANCE_WORDS.test(normalized) || OPENING_WORDS.test(normalized)
}
