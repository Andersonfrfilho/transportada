/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  NFE_ACCESS_KEY_LENGTH,
  NFE_ACCESS_KEY_PATTERN,
  extractNfeAccessKey,
} from '@/modules/shared/nfeAccessKey.service'

const NUMERIC_KEY = '35250812345678000199550010000000011000000017'
/** CNPJ alfanumérico (IN RFB 2229/2024) nas posições 7 a 20 — produção desde 01/07/2026. */
const ALPHANUMERIC_KEY = '35250812ABC34501DE35550010000000011000000017'

describe('nfe access key extraction', () => {
  test('a chave tem quarenta e quatro posições, e o padrão é o mesmo do backend', () => {
    expect(NFE_ACCESS_KEY_LENGTH).toBe(44)
    expect(NFE_ACCESS_KEY_PATTERN.source).toBe('^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$')
  })

  test.each([
    ['a chave crua que o código de barras da DANFE devolve', NUMERIC_KEY, NUMERIC_KEY],
    ['a chave de emitente com letra no CNPJ', ALPHANUMERIC_KEY, ALPHANUMERIC_KEY],
    [
      'a chave em minúscula, canonicalizada antes de conferir',
      ALPHANUMERIC_KEY.toLowerCase(),
      ALPHANUMERIC_KEY,
    ],
    ['a chave com espaço colado da cópia', `  ${NUMERIC_KEY}  `, NUMERIC_KEY],
    [
      'o `p=` do QR Code da NFC-e, com os campos separados por barra vertical',
      `https://www.fazenda.sp.gov.br/nfce/qrcode?p=${NUMERIC_KEY}|2|1|1|A1B2C3`,
      NUMERIC_KEY,
    ],
    [
      'o `p=` sem barra vertical alguma',
      `https://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${NUMERIC_KEY}`,
      NUMERIC_KEY,
    ],
    [
      'o `p=` de emitente com letra no CNPJ',
      `https://www.fazenda.sp.gov.br/nfce/qrcode?p=${ALPHANUMERIC_KEY}|2|1|1|A1B2C3`,
      ALPHANUMERIC_KEY,
    ],
    [
      'o `chNFe=` da consulta da NF-e modelo 55',
      `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?chNFe=${NUMERIC_KEY}&tpAmb=1`,
      NUMERIC_KEY,
    ],
    [
      'o `chNFe=` escrito em outra caixa pelo portal estadual',
      `https://consulta.sefaz.gov.br/nfe?CHNFE=${NUMERIC_KEY}`,
      NUMERIC_KEY,
    ],
    [
      'o `chNFe=` que vem depois de outro parâmetro',
      `https://www.nfe.fazenda.gov.br/portal/consulta?tpAmb=1&chNFe=${NUMERIC_KEY}`,
      NUMERIC_KEY,
    ],
  ])('extrai %s', (_name, scanned, expected) => {
    expect(extractNfeAccessKey(scanned)).toBe(expected)
  })

  /**
   * A ausência é a resposta, nunca uma exceção: a câmera devolve o que estiver na frente dela, e o
   * separador que apontou para a etiqueta errada precisa de um aviso na tela, não de uma tela branca.
   */
  test.each([
    ['o texto que não é chave nem URL', 'nota fiscal 123'],
    ['a etiqueta de rastreio da transportadora', 'BR123456789BR'],
    ['a leitura vazia', ''],
    ['só espaço', '   '],
    ['uma posição a menos', NUMERIC_KEY.slice(0, 43)],
    ['uma posição a mais', `${NUMERIC_KEY}7`],
    [
      'a letra que caiu fora das doze posições do CNPJ',
      `35250812345678000199550010000000011000000A7`,
    ],
    ['a letra antes do CNPJ, onde só há dígito', `3525A812345678000199550010000000011000000017`],
    ['o caractere fora do conjunto', `352508123456780001995500100000000110000000@`],
    [
      'o `p=` cujo primeiro segmento não é chave',
      'https://www.fazenda.sp.gov.br/nfce/qrcode?p=2|1|1',
    ],
    ['o `p=` vazio', 'https://www.fazenda.sp.gov.br/nfce/qrcode?p='],
    ['a URL sem parâmetro algum', 'https://www.nfe.fazenda.gov.br/portal/principal.aspx'],
  ])('devolve ausência para %s', (_name, scanned) => {
    expect(extractNfeAccessKey(scanned)).toBeUndefined()
  })

  /**
   * O `p=` vence o `chNFe=` porque é o parâmetro do QR Code impresso na DANFE — o outro só aparece
   * em link de portal, colado à mão. Com os dois na mesma URL, a câmera leu o primeiro.
   */
  test('com os dois parâmetros presentes, o `p=` do QR Code manda', () => {
    const scanned = `https://consulta.sefaz.gov.br/nfce?p=${NUMERIC_KEY}|2&chNFe=${ALPHANUMERIC_KEY}`

    expect(extractNfeAccessKey(scanned)).toBe(NUMERIC_KEY)
  })
})
