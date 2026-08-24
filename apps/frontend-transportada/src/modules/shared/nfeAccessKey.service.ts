/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A chave herda o CNPJ do emitente nas posições 7 a 20, e ele é alfanumérico desde 01/07/2026
 * (IN RFB 2229/2024). Um `\d{44}` recusaria a nota de emitente com letra — é o mesmo padrão que a
 * API importa de `@adatechnology/fiscal-provider`, reescrito porque o bundle não carrega o pacote.
 */
export const NFE_ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/u

export const NFE_ACCESS_KEY_LENGTH = 44

const QUERY_SEPARATOR = /[?&]/u
const KEY_VALUE_SEPARATOR = '='
/** O `p=` do QR Code empacota chave, ambiente, versão e digest separados por barra vertical. */
const QR_FIELD_SEPARATOR = '|'

/**
 * O QR Code da NFC-e traz a chave em `p=`; o link do portal da NF-e, em `chNFe=`. O nome do
 * parâmetro é comparado em caixa baixa porque cada Secretaria escreve o dele de um jeito.
 */
function readQueryParameter(scanned: string, name: string): string | undefined {
  for (const part of scanned.split(QUERY_SEPARATOR)) {
    const separator = part.indexOf(KEY_VALUE_SEPARATOR)
    if (separator === -1) continue
    if (part.slice(0, separator).toLowerCase() !== name) continue

    return part.slice(separator + 1)
  }

  return undefined
}

/**
 * Ausência é a resposta para tudo que não é chave — a câmera devolve o que estiver na frente dela, e
 * quem apontou para a etiqueta de rastreio precisa de um aviso na tela, não de uma exceção.
 */
export function extractNfeAccessKey(scanned: string): string | undefined {
  const text = scanned.trim()
  // O `p=` vence: ele é o parâmetro impresso na DANFE, e o `chNFe=` só aparece em link colado à mão.
  const parameter = readQueryParameter(text, 'p') ?? readQueryParameter(text, 'chnfe')
  const candidate = (parameter?.split(QR_FIELD_SEPARATOR)[0] ?? text).trim().toUpperCase()

  return NFE_ACCESS_KEY_PATTERN.test(candidate) ? candidate : undefined
}
