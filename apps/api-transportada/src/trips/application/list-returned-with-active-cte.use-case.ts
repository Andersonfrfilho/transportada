/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type ReturnedWithActiveCteEntry = {
  readonly cteAccessKey: string
  readonly returnedAt: string
  readonly returnReason: string
  readonly tripDocumentId: string
  readonly tripId: string
}

export type ListReturnedWithActiveCtePort = {
  listReturnedWithActiveCte(input: {
    readonly companyId: string
  }): Promise<readonly ReturnedWithActiveCteEntry[]>
}

export type ListReturnedWithActiveCteInput = {
  readonly companyId: string
  readonly repository: ListReturnedWithActiveCtePort
}

export type ListReturnedWithActiveCteResult = {
  readonly entries: readonly ReturnedWithActiveCteEntry[]
}

/**
 * ADR-0043 §2 (D8): `returned` nunca dispara nada no fiscal — o CT-e emitido continua válido, essa
 * é regra da operação, não escolha de produto. O que esta leitura dá é visibilidade: nota que
 * voltou carregando um CT-e autorizado é situação que precisa ser vista sem ninguém procurar. Sem
 * cancelamento automático aqui — a ação de cancelar o CT-e, quando existir, é sempre humana
 * (reaproveita `CTE_ATTEMPT_KINDS.cancel`, que já existe).
 */
export async function listReturnedWithActiveCte(
  input: ListReturnedWithActiveCteInput,
): Promise<ListReturnedWithActiveCteResult> {
  const entries = await input.repository.listReturnedWithActiveCte(input)
  return { entries }
}
