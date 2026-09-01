/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 065 D1b: a chave da NF-e por extenso serve para consultar no portal; o **código de barras** é
 * o que a portaria do cliente bipa. Sem ele, o conferente digita 44 dígitos com o caminhão parado.
 *
 * Code 128 no subconjunto **C**, que codifica dois dígitos por símbolo — a chave tem 44 dígitos
 * pares e cabe em 22 símbolos, que é o que mantém o código estreito o bastante para caber na tela do
 * celular e no papel do romaneio.
 *
 * O gerador é nosso porque o bundle não carrega biblioteca de geração — e porque Code 128-C numérico
 * é pequeno o bastante para ser lido inteiro num teste. Ele devolve **as larguras das barras**, e
 * quem desenha é o componente: SVG na tela, o mesmo SVG na impressão.
 */

/** Tabela oficial: cada valor vira seis larguras alternando barra e espaço, somando onze módulos. */
const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
] as const

const START_CODE_C = 105
const STOP_VALUE = 106
const CHECKSUM_MODULUS = 103
const DIGITS_PER_SYMBOL = 2

export class Code128EncodingError extends Error {
  public constructor() {
    super('CODE128_C_REQUIRES_AN_EVEN_DIGIT_STRING')
    this.name = 'Code128EncodingError'
  }
}

/**
 * Devolve as larguras em módulos, começando por **barra** e alternando. Desenhar é do componente:
 * assim o mesmo cálculo serve a tela e ao papel, e o teste lê números em vez de pixels.
 */
export function encodeCode128C(digits: string): readonly number[] {
  if (!/^[0-9]+$/u.test(digits) || digits.length % DIGITS_PER_SYMBOL !== 0) {
    throw new Code128EncodingError()
  }

  const values: number[] = [START_CODE_C]
  for (let index = 0; index < digits.length; index += DIGITS_PER_SYMBOL) {
    values.push(Number(digits.slice(index, index + DIGITS_PER_SYMBOL)))
  }

  /** O dígito verificador do Code 128 é a soma ponderada pela posição, e a posição começa em zero. */
  const checksum = values.reduce(
    (total, value, position) => total + value * (position === 0 ? 1 : position),
    0,
  )
  values.push(checksum % CHECKSUM_MODULUS, STOP_VALUE)

  return values.flatMap((value) => [...(CODE128_PATTERNS[value] ?? '')].map(Number))
}

/** A largura total em módulos — é o que o SVG usa como `viewBox`, sem chutar escala. */
export function totalCode128Width(widths: readonly number[]): number {
  return widths.reduce((total, width) => total + width, 0)
}
