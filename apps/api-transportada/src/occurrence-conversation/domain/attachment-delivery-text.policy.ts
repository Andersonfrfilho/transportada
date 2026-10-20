/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O texto que acompanha o arquivo levado ao motorista quando a ocorrência não abre retorno (sem retorno não
 * há o texto do tipo): diz a que requisição o arquivo responde. Sem nome de tipo, o arquivo vai sozinho.
 */
export function describeAttachmentDeliveryText(typeName: null | string): string {
  const name = typeName?.trim() ?? ''
  return name === '' ? '' : `Segue a requisição: ${name}`
}
