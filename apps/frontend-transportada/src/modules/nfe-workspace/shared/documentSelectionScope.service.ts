/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 103: **o que o filtro esconde não é despachado.**
 *
 * ⚠️ Medido em 2026-09-09, em produção local: o operador selecionou um conjunto amplo, estreitou o
 * filtro para 21 notas, leu "21 notas encontradas" na tela e pediu a montagem de roteiro. Foram
 * **345 notas** — as marcadas antes do filtro continuavam no `Set`, invisíveis. O solver repartiu
 * entre 6 veículos e criou 7 viagens, uma delas com **207 notas**.
 *
 * A seleção é podada por **derivação**, não apagando o estado: a poda por efeito reentraria a cada
 * render (o `Set` troca de identidade), e apagar o estado faria limpar o filtro perder a escolha de
 * quem só queria olhar outra faixa. O invariante que importa é o do despacho — nada que a tela não
 * mostra pode sair —, e a derivação o garante sem tocar no que o operador marcou.
 */

/**
 * A interseção entre o que está marcado e o que o filtro deixa ver. `filtered` é o conjunto **do
 * filtro**, não o da página: seleção entre páginas do mesmo filtro é legítima e continua valendo.
 */
export function scopeSelectionToFilter(input: {
  readonly filteredIds: readonly string[]
  readonly selectedIds: ReadonlySet<string>
}): ReadonlySet<string> {
  const visible = new Set(input.filteredIds)

  return new Set([...input.selectedIds].filter((id) => visible.has(id)))
}

/**
 * Quantas marcações o filtro está escondendo. Zero na esmagadora maioria das vezes; quando não é, a
 * tela precisa dizer — o operador que estreitou o filtro merece saber que deixou marcação para trás,
 * em vez de descobrir pela viagem errada.
 */
export function countSelectionHiddenByFilter(input: {
  readonly filteredIds: readonly string[]
  readonly selectedIds: ReadonlySet<string>
}): number {
  return input.selectedIds.size - scopeSelectionToFilter(input).size
}
