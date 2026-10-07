/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Executor de mentira para provar ordem de consultas sem banco: cada `select().from(tabela)…` vira uma
 * consulta contada, e o pico de consultas ao mesmo tempo denuncia concorrência numa transação.
 */

export type RecordingSelectExecutor = {
  readonly executor: unknown
  readonly stats: { maxInFlight: number; queryCount: number }
}

type RecordingParams = {
  /** As linhas devolvidas por tabela; a que faltar devolve lista vazia. */
  readonly rowsByTable?: ReadonlyMap<unknown, readonly unknown[]>
}

export function createRecordingSelectExecutor(
  params: RecordingParams = {},
): RecordingSelectExecutor {
  const stats = { maxInFlight: 0, queryCount: 0 }
  let inFlight = 0

  function createBuilder(table: { current?: unknown }): object {
    const builder: object = new Proxy(
      {},
      {
        get(_target, property) {
          if (property === 'then') {
            return (resolve: (rows: unknown[]) => void) => {
              stats.queryCount += 1
              inFlight += 1
              stats.maxInFlight = Math.max(stats.maxInFlight, inFlight)
              setTimeout(() => {
                inFlight -= 1
                resolve([...(params.rowsByTable?.get(table.current) ?? [])])
              }, 0)
            }
          }
          if (property === 'from') {
            return (source: unknown) => {
              table.current = source
              return builder
            }
          }
          return () => builder
        },
      },
    )
    return builder
  }

  return { executor: { select: () => createBuilder({}) }, stats }
}
