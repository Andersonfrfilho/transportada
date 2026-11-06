/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  findNfeAccessKeyInScan,
  hasValidNfeAccessKeyCheckDigit,
} from '@/modules/shared/nfeScannedKey.service'

/** Exemplo do Manual de Orientação do Contribuinte: DV 3, calculado à mão, não pelo código. */
const MANUAL_KEY = '35080599999090910270550010000000015180051273'
const MANUAL_KEY_WRONG_DV = '35080599999090910270550010000000015180051274'
const ALPHANUMERIC_BASE = '35260712AB34CD56EF78550010000000011000000001'

/** Módulo 11 reescrito aqui, de forma independente, só para fabricar chave alfanumérica válida. */
function withCheckDigit(base43: string): string {
  const weights = [2, 3, 4, 5, 6, 7, 8, 9]
  const sum = [...base43]
    .reverse()
    .reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * weights[index % 8]!, 0)
  const remainder = sum % 11
  return `${base43}${remainder < 2 ? 0 : 11 - remainder}`
}

const ALPHANUMERIC_KEY = withCheckDigit(ALPHANUMERIC_BASE.slice(0, 43))

/** Pistola em layout americano, Windows ABNT2: as teclas de pontuação saem trocadas. */
const US_TO_ABNT2: Readonly<Record<string, string>> = {
  '?': ':',
  '/': ';',
  ':': 'Ç',
  '=': ']',
  '&': '°',
  '|': '|',
}
function scramble(text: string): string {
  return [...text].map((char) => US_TO_ABNT2[char] ?? char).join('')
}

describe('handheld scanned text: access key anywhere', () => {
  test('o dígito verificador do exemplo do manual fecha', () => {
    expect(hasValidNfeAccessKeyCheckDigit(MANUAL_KEY)).toBe(true)
    expect(hasValidNfeAccessKeyCheckDigit(MANUAL_KEY_WRONG_DV)).toBe(false)
    expect(hasValidNfeAccessKeyCheckDigit(ALPHANUMERIC_KEY)).toBe(true)
  })

  const qrUrl = `https://www.nfe.fazenda.gov.br/portal/consulta.aspx?p=${MANUAL_KEY}|2|1|1|ABC123`
  const portalUrl = `https://www.nfe.fazenda.gov.br/portal/consulta.aspx?tpAmb=1&chNFe=${MANUAL_KEY}`

  test.each([
    ['Code-128 cru', MANUAL_KEY, MANUAL_KEY],
    ['QR com `p=` correto', qrUrl, MANUAL_KEY],
    ['QR com `chNFe=` correto', portalUrl, MANUAL_KEY],
    ['QR com `p=` embaralhado pelo layout americano', scramble(qrUrl), MANUAL_KEY],
    ['QR com `chNFe=` embaralhado pelo layout americano', scramble(portalUrl), MANUAL_KEY],
    ['prefixo e sufixo configurados no leitor', `NF-${MANUAL_KEY}#FIM`, MANUAL_KEY],
    ['prefixo numérico colado na chave', `123${MANUAL_KEY}`, MANUAL_KEY],
    ['chave minúscula de CNPJ alfanumérico', ALPHANUMERIC_KEY.toLowerCase(), ALPHANUMERIC_KEY],
    [
      'chave alfanumérica no QR embaralhado',
      scramble(`x?p=${ALPHANUMERIC_KEY}|2`),
      ALPHANUMERIC_KEY,
    ],
  ])('acha a chave em %s', (_name, scanned, expected) => {
    expect(findNfeAccessKeyInScan(scanned)).toBe(expected)
  })

  test.each([
    ['vazio', ''],
    ['etiqueta de volume', 'VOL-000123/0004'],
    ['código de embalagem de 13 dígitos', '7891000100103'],
    ['chave com dígito verificador errado', MANUAL_KEY_WRONG_DV],
    ['quarenta e três posições', MANUAL_KEY.slice(0, 43)],
  ])('devolve ausência para %s', (_name, scanned) => {
    expect(findNfeAccessKeyInScan(scanned)).toBeUndefined()
  })
})
