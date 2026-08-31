/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReconciliationEntry } from './companyUsers.types'

export type ReconciliationSummary = Readonly<{
  /** Total do que precisa de conserto — a soma das duas listas, e nunca a base de um botão só. */
  divergent: number
  /** Existe de um lado só: é o que o botão de criar resolve, e o que ele tem para enviar. */
  missingSomewhere: readonly ReconciliationEntry[]
  /** Existe dos dois lados sem ficha aqui: é o que o botão de preencher resolve. */
  withoutProfile: readonly ReconciliationEntry[]
}>

/**
 * Duas divergências diferentes, duas contagens.
 *
 * Contar tudo junto e mandar o total para o botão de criar produzia o defeito que ninguém
 * conseguia explicar: com a única divergência sendo ficha vazia, o rodapé anunciava "criar 1 que
 * falta" e o clique enviava dois conjuntos vazios. A API respondia certo — nada a criar — e a tela
 * ficava idêntica, como se o botão estivesse quebrado.
 */
export function summarizeReconciliation(
  entries: readonly ReconciliationEntry[],
): ReconciliationSummary {
  const missingSomewhere = entries.filter(
    (entry) => entry.status === 'missing-in-realm' || entry.status === 'missing-locally',
  )
  const withoutProfile = entries.filter((entry) => entry.status === 'profile-missing')

  return {
    divergent: missingSomewhere.length + withoutProfile.length,
    missingSomewhere,
    withoutProfile,
  }
}

/** Os alvos que o botão de criar envia. Lista vazia dos dois lados é botão que não deve existir. */
export function toSynchronizeTargets(
  entries: readonly ReconciliationEntry[],
): Readonly<{ subjects: readonly string[]; userIds: readonly string[] }> {
  return {
    subjects: entries
      .filter((entry) => entry.status === 'missing-locally')
      .map((entry) => entry.realm?.subject ?? ''),
    userIds: entries
      .filter((entry) => entry.status === 'missing-in-realm')
      .map((entry) => entry.local?.userId ?? ''),
  }
}
