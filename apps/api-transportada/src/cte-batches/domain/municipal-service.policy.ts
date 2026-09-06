/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Transporte que começa e termina **no mesmo município** é serviço municipal: ele gera NFS-e, com
 * ISS para a prefeitura, e não CT-e, que é documento de ICMS. A separação já existia na interface —
 * dois botões, em duas telas, cada um nomeando o que emite —, e esta política é o que permite ao
 * servidor recusar em vez de depender de o operador clicar no lugar certo.
 *
 * ⚠️ **Ela só vale onde o perfil de emissão pedir.** Medido em produção: das notas de mesmo
 * município, 0 de 920 tinham CT-e — ligar isto para todo mundo não barraria nada —, e as 62 NFS-e
 * emitidas eram **intermunicipais**, então a leitura "municipal é NFS-e" não descreve esta
 * operação. Quem sabe se a regra vale é quem configura o perfil, e o produto é genérico
 * (ADR-0021): a decisão é dado, não premissa no código.
 *
 * ⚠️ **A comparação é pelo código do IBGE, nunca pelo nome.** `RIBEIRAO PRETO`, `Ribeirão Preto` e
 * `RIBEIRÃO PRETO` são a mesma cidade escrita de três jeitos, e é assim que ela chega das notas — a
 * mesma razão pela qual o mapa da montagem casa município por código.
 *
 * ⚠️ **Código ausente não decide nada.** Nota sem o código de um dos lados devolve `unknown`, e quem
 * pergunta segue com o comportamento anterior. Chutar aqui trocaria uma emissão possivelmente errada
 * por uma emissão impossível — e nota antiga sem código completo existe.
 *
 * ⚠️ São os municípios dos **participantes fiscais** — emitente e destinatário —, não o destino
 * físico da spec 073. Onde o caminhão encosta é decisão de roteiro; quem figura no documento é o
 * participante, e é o participante que define a competência do imposto.
 */
export const SERVICE_SCOPE = {
  /** Emitente e destinatário no mesmo município: competência da prefeitura. */
  municipal: 'municipal',
  /** Municípios distintos: competência estadual. */
  interMunicipal: 'inter_municipal',
  /** Falta o código de um dos lados — não dá para dizer, e não se inventa. */
  unknown: 'unknown',
} as const

export type ServiceScope = (typeof SERVICE_SCOPE)[keyof typeof SERVICE_SCOPE]

export type ResolveServiceScopeParams = {
  readonly recipientCityCode: string | null
  readonly senderCityCode: string | null
}

export function resolveServiceScope({
  recipientCityCode,
  senderCityCode,
}: ResolveServiceScopeParams): ServiceScope {
  const sender = normalize(senderCityCode)
  const recipient = normalize(recipientCityCode)
  if (sender === null || recipient === null) return SERVICE_SCOPE.unknown

  return sender === recipient ? SERVICE_SCOPE.municipal : SERVICE_SCOPE.interMunicipal
}

function normalize(value: string | null): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length === 0 ? null : trimmed
}
