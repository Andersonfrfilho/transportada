/* Copyright (c) 2026 Ada Technology. MIT License. */

const DIACRITIC_PATTERN = /[̀-ͯ]/g
const NON_NAME_PATTERN = /[^A-Z0-9 ]+/g
const WHITESPACE_PATTERN = /\s+/g

/**
 * A dobra do nome de município, num lugar só. Ela decide três coisas que precisam concordar: se a
 * lista colada casa com a linha do IBGE, se a cidade já está na zona, e qual polígono do mapa
 * pertence a qual zona. Três cópias divergiriam, e a divergência apareceria como cidade que some do
 * desenho sem sumir da tabela.
 *
 * A pontuação cai porque o cliente escreve `MOGI-MIRIM` e o IBGE publica `Mogi Mirim`; o acento cai
 * porque a planilha impressa vem sem ele.
 */
export function foldRegionCityName(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITIC_PATTERN, '')
    .toUpperCase()
    .replace(NON_NAME_PATTERN, ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
}
