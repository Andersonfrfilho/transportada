/* Copyright (c) 2026 Ada Technology. MIT License. */
export const PHONE_MAX_LENGTH = 11
/** Largura do campo já mascarado — `(11) 98765-4321`; sem ela o `maxLength` cortaria a pontuação. */
export const PHONE_MASK_LENGTH = 15
const LANDLINE_LENGTH = 10

/** Nenhum corte por tamanho: dígito excedente precisa continuar visível para a validação acusar. */
export function stripPhone(value: string): string {
  return value.replace(/\D/g, '')
}

/** O nono dígito move o hífen: celular quebra em 5-4, fixo em 4-4. */
export function formatPhone(value: string): string {
  const digits = stripPhone(value)
  if (digits.length > PHONE_MAX_LENGTH) return digits
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`

  const areaCode = digits.slice(0, 2)
  const subscriber = digits.slice(2)
  if (subscriber.length <= 4) return `(${areaCode}) ${subscriber}`

  const split = digits.length > LANDLINE_LENGTH ? 5 : 4
  return `(${areaCode}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`
}

const LOCAL_MOBILE_LENGTH = 9
const LOCAL_LANDLINE_LENGTH = 8

/**
 * O telefone **que já veio de fora**, formatado para leitura — não confundir com `formatPhone`,
 * que é a máscara de quem digita.
 *
 * ⚠️ A diferença é o DDD. `formatPhone` sempre trata os dois primeiros dígitos como código de área,
 * o que é verdade num campo que o operador está preenchendo e é mentira no `<fone>` da NF-e: o
 * emitente manda `39771234` com a mesma naturalidade com que manda `1639771234`, e mascarar o
 * primeiro como `(39) 771234` inventa um DDD de Minas num telefone de Ribeirão Preto.
 *
 * Contagem que não é nenhuma das quatro conhecidas — vazio, ramal, número internacional — sai
 * **como veio**. Um telefone estranho impresso cru é conferível; um telefone estranho remendado
 * até caber numa máscara é indistinguível de um telefone certo.
 */
export function formatStoredPhone(value: string): string {
  const digits = stripPhone(value)
  if (digits.length === LANDLINE_LENGTH || digits.length === PHONE_MAX_LENGTH) {
    return formatPhone(digits)
  }
  if (digits.length === LOCAL_MOBILE_LENGTH || digits.length === LOCAL_LANDLINE_LENGTH) {
    const split = digits.length === LOCAL_MOBILE_LENGTH ? 5 : 4
    return `${digits.slice(0, split)}-${digits.slice(split)}`
  }
  return value.trim()
}

export function isCompletePhone(value: string): boolean {
  const length = stripPhone(value).length
  return length === LANDLINE_LENGTH || length === PHONE_MAX_LENGTH
}
