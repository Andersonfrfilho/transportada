/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ADR-0044 §1: a matriz de estrada fora do ar **não** vira haversine. O worker deixa este erro
 * subir, e o handler o converte em sugestão `failed` com código estável — resultado ruim disfarçado
 * de bom é pior que ausência.
 *
 * A mensagem carrega o código porque é por ela que o handler o reconhece: no worker não há resposta
 * HTTP para carregar `status`, e um `instanceof` atravessando o `catch` de um adaptador é frágil.
 */
export class RoutingMatrixUnavailableError extends Error {
  public override readonly name = 'RoutingMatrixUnavailableError'

  public constructor(context?: Readonly<Record<string, unknown>>) {
    super(`ROUTING_MATRIX_UNAVAILABLE${formatContext(context)}`)
  }
}

/**
 * O contexto é diagnóstico, e diagnóstico não pode derrubar o erro que ele descreve: `JSON.stringify`
 * lança em `BigInt` e em referência circular, e o construtor falhando aqui mataria a causa real —
 * a matriz fora do ar — para trocá-la por um `TypeError` de serialização. Contexto que não serializa
 * vira marca, não exceção.
 */
function formatContext(context: Readonly<Record<string, unknown>> | undefined): string {
  if (context === undefined) return ''

  try {
    return ` ${JSON.stringify(context, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))}`
  } catch {
    return ' [context not serializable]'
  }
}
