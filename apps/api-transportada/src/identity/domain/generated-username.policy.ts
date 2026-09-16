/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Espelha `USERNAME_PATTERN` da rota de edição: o login gerado tem de ser um que a edição aceita. */
const GENERATED_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,59}$/u
const USERNAME_MAX_LENGTH = 60
const USERNAME_SEPARATOR = '.'

/** Numerado de 2 em diante: `deisy.coimbra2` é a segunda Deisy Coimbra, não a zero. */
const FIRST_NUMBER_SUFFIX = 2
export const MAX_NUMBERED_USERNAME_SUFFIX = 99

/** Partícula não é sobrenome: "Egberto Candido da Silva" vira `egberto.silva`, nunca `egberto.da`. */
const NAME_PARTICLES: ReadonlySet<string> = new Set([
  'da',
  'das',
  'de',
  'del',
  'della',
  'di',
  'do',
  'dos',
  'du',
  'e',
  'van',
  'von',
])

/**
 * Os logins que o convite tenta, na ordem: primeiro nome com o último sobrenome, depois com os
 * sobrenomes anteriores, e por fim o primeiro par numerado. Vazio quando o nome não rende nenhum
 * login válido — o convite cai no id interno, que sempre serve.
 */
export function buildUsernameCandidates(fullName: string): readonly string[] {
  const words = toUsernameWords(fullName)
  const [firstName, ...others] = words
  if (firstName === undefined) return []

  const surnames = others.filter((word) => !NAME_PARTICLES.has(word)).reverse()
  const pairs = (
    surnames.length === 0
      ? [firstName]
      : surnames.map((surname) => joinUsername(firstName, surname))
  ).filter((candidate) => GENERATED_USERNAME_PATTERN.test(candidate))
  const base = pairs[0]
  if (base === undefined) return []

  const numbered = Array.from(
    { length: MAX_NUMBERED_USERNAME_SUFFIX - FIRST_NUMBER_SUFFIX + 1 },
    (_, index) => withNumberSuffix(base, index + FIRST_NUMBER_SUFFIX),
  )
  return [...new Set([...pairs, ...numbered])]
}

export function pickAvailableUsername(
  params: Readonly<{ candidates: readonly string[]; taken: ReadonlySet<string> }>,
): string | undefined {
  return params.candidates.find((candidate) => !params.taken.has(candidate))
}

function toUsernameWords(fullName: string): readonly string[] {
  return fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .split(/\s+/u)
    .map((word) => word.replace(/[^a-z0-9]/gu, ''))
    .filter((word) => word.length > 0)
}

function joinUsername(firstName: string, surname: string): string {
  return `${firstName}${USERNAME_SEPARATOR}${surname}`.slice(0, USERNAME_MAX_LENGTH)
}

function withNumberSuffix(base: string, suffix: number): string {
  const digits = String(suffix)
  return `${base.slice(0, USERNAME_MAX_LENGTH - digits.length)}${digits}`
}
