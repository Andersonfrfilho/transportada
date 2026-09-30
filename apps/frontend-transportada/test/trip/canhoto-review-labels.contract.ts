/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.18: os rótulos do comprovante nos dois idiomas. Rótulo que falta num idioma não
 * quebra nada — o i18next cai no pt-BR e a tela fica bilíngue em silêncio, que foi exatamente como
 * `deliveryProof.imageLoading` passou. Por isso a paridade é asserção, e não disciplina.
 *
 * RF30: o veredito do canhoto **não** trava entrega, viagem, CT-e nem fatura. Nenhum texto pode
 * sugerir o contrário — "aguardando conferência", nunca "bloqueado"; "recusado", nunca "entrega
 * inválida".
 *
 * ⚠️ O escopo é `deliveryProof.*`, a superfície desta spec. O módulo inteiro tem 182 chaves só no
 * pt-BR, dívida antiga e de outras specs: alargar aqui reprovaria o gate por trabalho que a 220
 * não fez.
 */
import { describe, expect, it } from 'bun:test'

import englishLocale from '../../src/modules/trip/locales/trip.en.locale.json'
import portugueseLocale from '../../src/modules/trip/locales/trip.locale.json'

type LocaleNode = { readonly [key: string]: string | LocaleNode }

/** Vocabulário que faria o veredito parecer um portão. */
const BLOCKING_WORDS = [
  'bloque',
  'trava',
  'travad',
  'impede',
  'inválid',
  'invalid',
  'block',
  'prevent',
] as const

/**
 * Palavra sem acento no pt-BR é erro de digitação que nenhum teste pegava. A borda de palavra é
 * obrigatória: "automaticamente" está certo e não pode cair junto com "automatica".
 */
const UNACCENTED_SLIPS = /\b(conferencia|automatico|automatica|codigo|numero|nao)\b/

function flatten(node: LocaleNode, prefix = ''): ReadonlyMap<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') entries.set(prefix + key, value)
    else for (const [nested, text] of flatten(value, `${prefix}${key}.`)) entries.set(nested, text)
  }
  return entries
}

function placeholdersOf(text: string): readonly string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort()
}

const portugueseProof = flatten(
  (portugueseLocale as unknown as LocaleNode).deliveryProof as LocaleNode,
)
const englishProof = flatten((englishLocale as unknown as LocaleNode).deliveryProof as LocaleNode)

describe('os rótulos do comprovante nos dois idiomas (spec 220 T7.18)', () => {
  it('toda chave do comprovante existe nos dois idiomas', () => {
    const missingInEnglish = [...portugueseProof.keys()].filter((key) => !englishProof.has(key))
    const missingInPortuguese = [...englishProof.keys()].filter((key) => !portugueseProof.has(key))

    expect(missingInEnglish).toEqual([])
    expect(missingInPortuguese).toEqual([])
  })

  it('nenhum rótulo é texto vazio', () => {
    const empty = [...portugueseProof, ...englishProof]
      .filter(([, text]) => text.trim() === '')
      .map(([key]) => key)

    expect(empty).toEqual([])
  })

  it('as interpolações são as mesmas nos dois idiomas', () => {
    const divergent = [...portugueseProof]
      .filter(([key, text]) => {
        const translated = englishProof.get(key)
        return (
          translated !== undefined &&
          placeholdersOf(text).join(',') !== placeholdersOf(translated).join(',')
        )
      })
      .map(([key]) => key)

    expect(divergent).toEqual([])
  })

  it('nenhum texto do canhoto sugere que o veredito trava algo (RF30)', () => {
    const offenders = [...portugueseProof, ...englishProof]
      .filter(([key]) => key.startsWith('canhotoReview.'))
      .filter(([, text]) => BLOCKING_WORDS.some((word) => text.toLowerCase().includes(word)))
      .map(([key]) => key)

    expect(offenders).toEqual([])
  })

  it('o pt-BR está acentuado', () => {
    const unaccented = [...portugueseProof]
      .filter(([, text]) => UNACCENTED_SLIPS.test(text.toLowerCase()))
      .map(([key]) => key)

    expect(unaccented).toEqual([])
  })
})
