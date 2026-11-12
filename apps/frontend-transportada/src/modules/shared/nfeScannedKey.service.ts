/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NFE_ACCESS_KEY_LENGTH } from './nfeAccessKey.service'

/** A mesma forma de `NFE_ACCESS_KEY_PATTERN`, sem as âncoras, para casar uma janela do texto lido. */
const KEY_WINDOW_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/u
const ALPHANUMERIC_RUN = /[A-Z0-9]+/gu
const MODULE_ELEVEN = 11
const FIRST_WEIGHT = 2
const LAST_WEIGHT = 9
const ZERO_CODE = '0'.charCodeAt(0)

/** O valor do caractere no módulo 11 é o código menos o do zero: letra do CNPJ alfanumérico vale 17 a 42. */
function checkDigitOf(base: string): number {
  let sum = 0
  let weight = FIRST_WEIGHT
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += (base.charCodeAt(index) - ZERO_CODE) * weight
    weight = weight === LAST_WEIGHT ? FIRST_WEIGHT : weight + 1
  }
  const remainder = sum % MODULE_ELEVEN

  return remainder < 2 ? 0 : MODULE_ELEVEN - remainder
}

export function hasValidNfeAccessKeyCheckDigit(accessKey: string): boolean {
  if (!KEY_WINDOW_PATTERN.test(accessKey)) return false
  const base = accessKey.slice(0, NFE_ACCESS_KEY_LENGTH - 1)

  return checkDigitOf(base) === Number(accessKey.slice(NFE_ACCESS_KEY_LENGTH - 1))
}

function findInRun(run: string): string | undefined {
  for (let start = 0; start + NFE_ACCESS_KEY_LENGTH <= run.length; start += 1) {
    const window = run.slice(start, start + NFE_ACCESS_KEY_LENGTH)
    if (hasValidNfeAccessKeyCheckDigit(window)) return window
  }

  return undefined
}

/**
 * O leitor de mão com teclado americano num Windows ABNT2 troca `?`, `=` e `/` da URL do QR, então
 * a chave é procurada **dentro** do texto, e não em `p=`/`chNFe=`: os 44 caracteres seguem contíguos.
 * O dígito verificador desempata a janela quando prefixo ou sufixo do leitor também é alfanumérico.
 * Ausência é a resposta para o que não é chave — etiqueta de volume é ignorada em silêncio.
 */
export function findNfeAccessKeyInScan(scanned: string): string | undefined {
  const runs = scanned.toUpperCase().match(ALPHANUMERIC_RUN) ?? []
  const exactRuns = runs.filter((run) => run.length === NFE_ACCESS_KEY_LENGTH)
  for (const run of [...exactRuns, ...runs]) {
    const found = findInRun(run)
    if (found !== undefined) return found
  }

  return undefined
}
