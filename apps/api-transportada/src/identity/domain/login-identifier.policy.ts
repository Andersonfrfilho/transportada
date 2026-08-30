/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LoginIdentifierKind } from '../../database/login-identifier.schema.js'

/**
 * O que a pessoa digitou na primeira etapa do login. Ela não escolhe o tipo — ninguém marca "isto é
 * um CPF" antes de entrar —, então a forma do texto é que decide onde procurar.
 */
export type ParsedLoginIdentifier = {
  readonly kind: LoginIdentifierKind
  readonly value: string
}

/** Caixa e espaço não são identidade: `Ana@X.test` e `ana@x.test` são a mesma caixa postal. */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Máscara não é identidade. Alfanumérico em caixa baixa serve a CPF e ao CNPJ com letra, que é o
 * caso normal desde 2026 — filtrar só dígito perderia a base alfanumérica inteira.
 */
function normalizeDocument(value: string): string {
  return value.replace(/[^0-9a-z]/giu, '').toLowerCase()
}

function normalizePhone(value: string): string {
  return value.replace(/\D/gu, '')
}

const DOCUMENT_LENGTHS = new Set([11, 14])
/** Fixo com DDD tem 10, celular tem 11 — os dois são contato de uma pessoa. */
const PHONE_LENGTHS = new Set([10, 11])

/**
 * A ordem importa e não é arbitrária:
 *
 * - **e-mail** é reconhecido pelo `@`, que nenhum documento ou telefone tem;
 * - **documento** vem antes de telefone porque onze dígitos são ambíguos — um CPF e um celular têm
 *   o mesmo comprimento. Documento é o identificador mais específico de uma pessoa, e quem digita
 *   onze dígitos num campo de login quase sempre está digitando o CPF;
 * - **telefone** fica com o que sobra dentro do formato dele.
 *
 * Texto que não é nenhum dos três não vira palpite: a etapa devolve `undefined` e o valor segue
 * como veio para o provedor, que o trata como login comum. É assim que quem digita o próprio
 * `username` continua entrando sem passar por busca nenhuma.
 */
export function parseLoginIdentifier(input: string): ParsedLoginIdentifier | undefined {
  const trimmed = input.trim()
  if (trimmed === '') return undefined

  if (trimmed.includes('@')) {
    const email = normalizeEmail(trimmed)
    return email.length > 1 ? { kind: 'email', value: email } : undefined
  }

  const document = normalizeDocument(trimmed)
  if (DOCUMENT_LENGTHS.has(document.length)) return { kind: 'document', value: document }

  const phone = normalizePhone(trimmed)
  if (PHONE_LENGTHS.has(phone.length)) return { kind: 'phone', value: phone }

  return undefined
}

export type LoginHintResolution = {
  /** O que segue para o provedor. Nunca vazio: sem resolução, é o que a pessoa digitou. */
  readonly loginHint: string
  /** Só para log e métrica. **Nunca** vai na resposta — seria dizer quem existe. */
  readonly matched: boolean
}

/**
 * Resolve o login canônico, e o silêncio é a regra: a resposta é **idêntica** para quem existe e
 * para quem não existe, porque a etapa é anônima e dizer "não encontrado" entregaria a base de
 * e-mails, CPFs e telefones a quem tivesse um script e paciência. É a mesma decisão que
 * `POST /password-resets` já tomou neste produto, e pelo mesmo motivo.
 *
 * Mais de uma pessoa com o mesmo identificador também não resolve: telefone é compartilhado no mundo
 * real, e escolher uma das duas em silêncio mandaria alguém tentar a senha na conta do colega.
 */
export function resolveLoginHint(input: {
  readonly candidates: readonly { readonly username: string }[]
  readonly typed: string
}): LoginHintResolution {
  const [single, ...rest] = input.candidates
  if (single === undefined || rest.length > 0 || single.username === '') {
    return { loginHint: input.typed.trim(), matched: false }
  }

  return { loginHint: single.username, matched: true }
}
