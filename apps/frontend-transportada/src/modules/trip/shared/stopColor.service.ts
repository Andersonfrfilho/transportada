/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A paleta das paradas, e agora **também a do traço que leva a elas**.
 *
 * ⚠️ Ela era reescrita em dois lugares com aritmética diferente — `index % N` na listagem da carga e
 * `(sequence - 1) % N` no mapa. As duas davam a mesma cor por acidente de chamada, e a terceira
 * cópia (o traço) é o tipo de coisa que quebra a coincidência sem ninguém ver.
 */
const STOP_COLOR_COUNT = 6

/**
 * A parada é numerada a partir de **1**, e é essa a entrada: quem tem índice de array converte na
 * chamada, e não aqui — dois contratos de numeração na mesma função é como a divergência começa.
 */
export function stopColorTokenOf(sequence: number): string {
  const wrapped =
    (((Math.trunc(sequence) - 1) % STOP_COLOR_COUNT) + STOP_COLOR_COUNT) % STOP_COLOR_COUNT

  return `--color-cargo-stop-${wrapped + 1}`
}

export function stopColorOf(sequence: number): string {
  return `var(${stopColorTokenOf(sequence)})`
}

/**
 * ⚠️ O MapLibre pinta em canvas e **não resolve `var()`**: ele precisa do valor já calculado. Por
 * isso o nome do token é exposto separado — sem isso o traço sairia transparente, que na prática é
 * um mapa sem roteiro e sem erro nenhum no console.
 */
export function resolveStopColor(sequence: number, root: HTMLElement): string {
  return getComputedStyle(root).getPropertyValue(stopColorTokenOf(sequence)).trim()
}
