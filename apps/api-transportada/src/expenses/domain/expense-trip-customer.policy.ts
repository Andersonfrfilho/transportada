/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 (ADR-0116 §3): a quem pertence a viagem no resultado "por cliente".
 *
 * ⚠️ REGRA AINDA NÃO CONFIRMADA PELO DONO. Hoje uma viagem com notas de vários clientes entra **inteira** no cliente
 * da nota de maior frete (empate: o menor CNPJ, para o resultado nunca depender da ordem de leitura). Se a decisão
 * mudar (ex.: dividir a viagem pelo frete de cada nota), troque **só** esta função: a consulta de viagens, os filtros
 * e a exportação consomem `pickTripCustomerTaxId` e não repetem a regra.
 */
export type TripCustomerDocument = {
  readonly senderTaxId: null | string | undefined
  readonly tripDocumentId: string
}

export type TripCustomerRevenueLine = {
  /** Frete da nota, em reais com casas decimais (`numeric`). */
  readonly amount: string
  readonly tripDocumentId: string
}

/** CNPJ do emitente que responde pela viagem inteira, ou `null` quando nenhuma nota tem emitente. */
export function pickTripCustomerTaxId(
  documents: readonly TripCustomerDocument[],
  lines: readonly TripCustomerRevenueLine[],
): null | string {
  const senderByDocument = new Map(
    documents.map((document) => [document.tripDocumentId, document.senderTaxId]),
  )
  let best: { amount: bigint; taxId: string } | null = null
  for (const line of lines) {
    const taxId = senderByDocument.get(line.tripDocumentId)
    if (taxId === null || taxId === undefined) continue
    const amount = BigInt(line.amount.replace('.', '').replace(/^-?\s*$/, '0'))
    if (best === null || amount > best.amount || (amount === best.amount && taxId < best.taxId)) {
      best = { amount, taxId }
    }
  }
  return best?.taxId ?? null
}
