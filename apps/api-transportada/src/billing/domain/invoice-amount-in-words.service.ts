/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { InvoiceAmountOutOfRangeError } from './invoice-amount-in-words.error.js'

const CENTS_PER_UNIT = 100n
const UNIT_WORDS: Readonly<Record<number, string>> = {
  0: 'zero',
  1: 'um',
  2: 'dois',
  3: 'três',
  4: 'quatro',
  5: 'cinco',
  6: 'seis',
  7: 'sete',
  8: 'oito',
  9: 'nove',
}
const TEEN_WORDS: Readonly<Record<number, string>> = {
  10: 'dez',
  11: 'onze',
  12: 'doze',
  13: 'treze',
  14: 'quatorze',
  15: 'quinze',
  16: 'dezesseis',
  17: 'dezessete',
  18: 'dezoito',
  19: 'dezenove',
}
const TENS_WORDS: Readonly<Record<number, string>> = {
  2: 'vinte',
  3: 'trinta',
  4: 'quarenta',
  5: 'cinquenta',
  6: 'sessenta',
  7: 'setenta',
  8: 'oitenta',
  9: 'noventa',
}
const HUNDRED_WORDS: Readonly<Record<number, string>> = {
  1: 'cento',
  2: 'duzentos',
  3: 'trezentos',
  4: 'quatrocentos',
  5: 'quinhentos',
  6: 'seiscentos',
  7: 'setecentos',
  8: 'oitocentos',
  9: 'novecentos',
}
/** Índice 0 = unidades/centenas; a palavra de escala acompanha o valor do grupo (singular/plural). */
const SCALE_WORD_BY_GROUP_INDEX: Readonly<Record<number, (groupValue: number) => string>> = {
  1: () => 'mil',
  2: (groupValue) => (groupValue === 1 ? 'milhão' : 'milhões'),
  3: (groupValue) => (groupValue === 1 ? 'bilhão' : 'bilhões'),
}
const HIGHEST_SUPPORTED_GROUP_INDEX = 3

type GroupPhrase = {
  readonly groupIndex: number
  readonly groupValue: number
  readonly text: string
}

type IntegerWords = {
  readonly lowestNonZeroGroupIndex: number | null
  readonly text: string
}

export function invoiceAmountInWords(amountScaled: bigint): string {
  const integerPart = amountScaled / CENTS_PER_UNIT
  const centsPart = Number(amountScaled % CENTS_PER_UNIT)

  const integerWords = integerToWords(integerPart)
  const currencyPhrase = buildCurrencyPhrase({ integerPart, integerWords })
  if (centsPart === 0) return currencyPhrase

  return `${currencyPhrase} e ${buildCentsPhrase(centsPart)}`
}

function buildCurrencyPhrase(input: {
  readonly integerPart: bigint
  readonly integerWords: IntegerWords
}): string {
  const { integerPart, integerWords } = input
  if (integerPart === 1n) return `${integerWords.text} real`

  const needsDeConnector =
    integerWords.lowestNonZeroGroupIndex !== null && integerWords.lowestNonZeroGroupIndex >= 2
  return needsDeConnector ? `${integerWords.text} de reais` : `${integerWords.text} reais`
}

function buildCentsPhrase(centsPart: number): string {
  const words = twoDigitsToWords(centsPart)
  return centsPart === 1 ? `${words} centavo` : `${words} centavos`
}

function integerToWords(value: bigint): IntegerWords {
  if (value === 0n) return { lowestNonZeroGroupIndex: null, text: 'zero' }

  const groups: number[] = []
  let remaining = value
  while (remaining > 0n) {
    groups.push(Number(remaining % 1000n))
    remaining /= 1000n
  }

  const phrases: GroupPhrase[] = []
  for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
    const groupValue = groups[groupIndex] ?? 0
    if (groupValue === 0) continue
    if (groupIndex > HIGHEST_SUPPORTED_GROUP_INDEX) throw new InvoiceAmountOutOfRangeError()
    phrases.push({ groupIndex, groupValue, text: groupToPhrase({ groupIndex, groupValue }) })
  }

  return {
    lowestNonZeroGroupIndex: phrases[phrases.length - 1]?.groupIndex ?? null,
    text: joinPhrases(phrases),
  }
}

function groupToPhrase(input: {
  readonly groupIndex: number
  readonly groupValue: number
}): string {
  const { groupIndex, groupValue } = input
  if (groupIndex === 1 && groupValue === 1) return 'mil'

  const scaleWord = SCALE_WORD_BY_GROUP_INDEX[groupIndex]?.(groupValue)
  const numeralWords = threeDigitsToWords(groupValue)
  return scaleWord ? `${numeralWords} ${scaleWord}` : numeralWords
}

/** Regra de escrita numérica: "e" só liga o último grupo quando ele é < 100 ou uma centena redonda. */
function joinPhrases(phrases: readonly GroupPhrase[]): string {
  return phrases.reduce((accumulated, phrase, index) => {
    if (index === 0) return phrase.text

    const isLast = index === phrases.length - 1
    const usesEConnector = isLast && (phrase.groupValue < 100 || phrase.groupValue % 100 === 0)
    return `${accumulated}${usesEConnector ? ' e ' : ' '}${phrase.text}`
  }, '')
}

function threeDigitsToWords(value: number): string {
  if (value === 100) return 'cem'

  const hundredsDigit = Math.floor(value / 100)
  const remainder = value % 100
  const hundredsWord = hundredsDigit > 0 ? HUNDRED_WORDS[hundredsDigit] : undefined
  const remainderWord = twoDigitsToWords(remainder)

  if (hundredsWord && remainderWord) return `${hundredsWord} e ${remainderWord}`
  return hundredsWord ?? remainderWord
}

function twoDigitsToWords(value: number): string {
  if (value === 0) return ''
  if (value < 10) return UNIT_WORDS[value] ?? ''
  if (value < 20) return TEEN_WORDS[value] ?? ''

  const tensDigit = Math.floor(value / 10)
  const unitDigit = value % 10
  const tensWord = TENS_WORDS[tensDigit] ?? ''
  return unitDigit === 0 ? tensWord : `${tensWord} e ${UNIT_WORDS[unitDigit]}`
}
