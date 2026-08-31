/* Copyright (c) 2026 Ada Technology. MIT License. */
import { partitionByExistence } from '@adatechnology/identity-reconciliation'

import type { ReconciliationEntry } from './companyUsers.types'

/**
 * A parte que o pacote não pode fazer: extrair o identificador que **esta** API espera.
 *
 * `summarizeReconciliation` e `partitionByExistence` são genéricos e leem só `status`, porque cada
 * produto chama o identificador local do jeito dele — aqui é `userId`, no contrato do pacote é
 * `id`. Traduzir isso é uma linha por sentido, e mantê-la aqui é o que permite ao pacote servir os
 * outros produtos sem aprender o vocabulário de nenhum.
 *
 * As duas listas vazias é a resposta honesta para "não há o que sincronizar", e é o sinal de que o
 * botão não deveria estar na tela.
 */
export function toSynchronizeTargets(
  entries: readonly ReconciliationEntry[],
): Readonly<{ subjects: readonly string[]; userIds: readonly string[] }> {
  const { missingInRealm, missingLocally } = partitionByExistence(entries)

  return {
    subjects: missingLocally.map((entry) => entry.realm?.subject ?? ''),
    userIds: missingInRealm.map((entry) => entry.local?.userId ?? ''),
  }
}
