/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O rótulo da parada imprimia `RUA MIGUEL PETRONI, SAO CARLOS, SP` — **sem o número**. Isso não é
 * cosmético: a parada agrupa por `(CEP, número, código do município)`, então dois portões da mesma
 * rua são **duas paradas** e apareciam com o texto idêntico. Numa viagem real de doze paradas,
 * `AVENIDA JOAO DE LOURENCO` apareceu duas vezes, e nada na tela dizia que eram lugares diferentes.
 *
 * E é o número que o motorista precisa para bater no portão: rua e cidade sozinhas não endereçam
 * nada num quarteirão.
 *
 * ⚠️ O número aqui é o **do cadastro**, cru, e não o normalizado da chave (`stop-address-key.ts`).
 * A chave existe para agrupar — sobe caixa, tira o `nº`, colapsa espaço; o rótulo existe para ser
 * lido, e `Nº 1.166-A` é o que está impresso na nota. Uniformizar os dois faria a tela mostrar uma
 * grafia que ninguém escreveu.
 */

export type StopLabelParts = Readonly<{
  city: string | null
  number: string | null
  state: string | null
  street: string | null
}>

/** "S/N", "SN", "sem número" — o mesmo conjunto que a chave reconhece, para não imprimir `, SN,`. */
const NO_NUMBER_PATTERN = /^(?:s\s*\/?\s*n|sem\s*n[uú]mero)$/iu

function clean(part: string | null): string {
  return (part ?? '').trim()
}

/**
 * `RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP` — o número logo depois da rua, que é a ordem em que se
 * lê um endereço em português e a que o motorista procura primeiro.
 *
 * Parte vazia sai fora em vez de virar vírgula solta: sem isso, endereço sem cidade imprimiria
 * `RUA X, 12, , SP`. Endereço sem número **também** sai fora — "S/N" é informação de cadastro, não
 * de rua, e poluir o rótulo com ela atrapalha justamente quem está procurando um número.
 */
export function buildStopLabel(parts: StopLabelParts): string {
  const number = clean(parts.number)
  const printableNumber = number === '' || NO_NUMBER_PATTERN.test(number) ? '' : number

  return [clean(parts.street), printableNumber, clean(parts.city), clean(parts.state)]
    .filter((part) => part !== '')
    .join(', ')
}
