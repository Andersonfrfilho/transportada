/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readCcmei } from '@/modules/application/shared/ccmei.service'

import {
  buildLabelledColumns,
  buildTextPdf,
  readSyntheticPage,
  CCMEI_TITLE_PLACEMENTS,
} from './ccmei-pdf.helper'

/** CNPJ com dígitos verificadores válidos, inventado para o teste. */
const VALID_CNPJ = '30213061000106'

async function readCcmeiPdf(
  columns: readonly Readonly<{ label: string; value: string; x: number; y: number }>[],
) {
  const bytes = buildTextPdf([...CCMEI_TITLE_PLACEMENTS, ...buildLabelledColumns(columns)])
  return readCcmei(await readSyntheticPage(bytes))
}

describe('leitura do CCMEI', () => {
  test('extrai o CNPJ e a data de início de atividades de um PDF de verdade', async () => {
    const reading = await readCcmeiPdf([
      { label: 'CNPJ', value: '30.213.061/0001-06', x: 60, y: 600 },
      { label: 'Data de Início de Atividades', value: '17/04/2018', x: 300, y: 600 },
    ])

    expect(reading.values.cnpj).toBe(VALID_CNPJ)
    expect(reading.values.openedAt).toBe('2018-04-17')
  })

  /**
   * A consulta à Receita devolve `openedAt` em ISO (medido: `2019-04-11`), e o CCMEI imprime
   * `dd/mm/aaaa`. Sem converter aqui, a comparação da P2 estaria comparando formatos, não datas.
   */
  test('a data sai em ISO, que é o formato com que ela vai ser comparada', async () => {
    const reading = await readCcmeiPdf([
      { label: 'Data de Início de Atividades', value: '01/12/2020', x: 60, y: 600 },
    ])

    expect(reading.values.openedAt).toBe('2020-12-01')
  })

  test('lê o nome empresarial, o nome fantasia e a situação cadastral', async () => {
    const reading = await readCcmeiPdf([
      { label: 'Nome Empresarial', value: 'FULANO DE TAL 12345678909', x: 60, y: 700 },
      { label: 'Nome Fantasia', value: 'NEX IT', x: 300, y: 700 },
      { label: 'Situação Cadastral Vigente', value: 'ATIVO', x: 60, y: 650 },
    ])

    expect(reading.values.legalName).toBe('FULANO DE TAL 12345678909')
    expect(reading.values.tradeName).toBe('NEX IT')
    expect(reading.values.situation).toBe('ATIVO')
  })

  test('lê o endereço comercial campo a campo', async () => {
    const reading = await readCcmeiPdf([
      { label: 'CEP', value: '02410-010', x: 60, y: 500 },
      { label: 'Logradouro', value: 'RUA JOAO DE LAET', x: 200, y: 500 },
      { label: 'Número', value: '724', x: 420, y: 500 },
      { label: 'Bairro', value: 'VILA AURORA', x: 60, y: 450 },
      { label: 'Município', value: 'SAO PAULO', x: 200, y: 450 },
      { label: 'UF', value: 'SP', x: 420, y: 450 },
    ])

    expect(reading.values.address).toEqual({
      district: 'VILA AURORA',
      number: '724',
      postalCode: '02410010',
      state: 'SP',
      street: 'RUA JOAO DE LAET',
      municipality: 'SAO PAULO',
    })
  })

  /**
   * CNPJ com dígito verificador errado é leitura errada, não dado novo: preencher o formulário com
   * ele empurraria o erro para dentro do cadastro. Ausência com motivo à vista é o comportamento.
   */
  test('CNPJ que não fecha o dígito verificador não vira valor', async () => {
    const reading = await readCcmeiPdf([
      { label: 'CNPJ', value: '30.213.061/0001-07', x: 60, y: 600 },
    ])

    expect(reading.values.cnpj).toBeUndefined()
    expect(reading.remarks).toContainEqual({ field: 'cnpj', reason: 'checkDigitFailed' })
  })

  test('data impossível não vira valor, e diz por quê', async () => {
    const reading = await readCcmeiPdf([
      { label: 'Data de Início de Atividades', value: '31/02/2018', x: 60, y: 600 },
    ])

    expect(reading.values.openedAt).toBeUndefined()
    expect(reading.remarks).toContainEqual({ field: 'openedAt', reason: 'notReadable' })
  })

  /** Campo que o documento não imprime é ausência com motivo, nunca string vazia no formulário. */
  test('rótulo ausente vira ressalva, não campo em branco', async () => {
    const reading = await readCcmeiPdf([
      { label: 'CNPJ', value: '30.213.061/0001-06', x: 60, y: 600 },
    ])

    expect(reading.values.legalName).toBeUndefined()
    expect(reading.remarks).toContainEqual({ field: 'legalName', reason: 'notPrinted' })
  })

  /** O CNPJ alfanumérico entra em produção em 01/07/2026 e o CCMEI vai imprimi-lo. */
  test('aceita CNPJ alfanumérico', async () => {
    const reading = await readCcmeiPdf([
      { label: 'CNPJ', value: '12.ABC.345/01DE-35', x: 60, y: 600 },
    ])

    expect(reading.values.cnpj).toBe('12ABC34501DE35')
  })
})
