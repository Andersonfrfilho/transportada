/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildNfseDescription,
  type NfseDescriptionDocument,
} from '../../src/nfse-invoices/domain/nfse-description.service.js'

const MAX_LENGTH = 2000
const MUNICIPALITY = 'Ribeirão Preto'
const LIST_TEMPLATE = 'Transporte das notas: {{notas}}.'
/** Prefixo que sozinho já estoura o teto mínimo do perfil (200): não sobra espaço para nota alguma. */
const OVERSIZED_TEMPLATE = `${'Prestação de serviço de transporte. '.repeat(6)}{{notas}}`

/**
 * Número de NF-e tem 9 dígitos, e o comprimento da entrada é o que decide se cortar a lista encurta
 * o texto: com entradas curtas o resumo do excedente pode custar mais que listar tudo.
 */
function buildDocument(position: number): NfseDescriptionDocument {
  return {
    number: String(position).padStart(9, '0'),
    series: '1',
  }
}

function buildDocuments(total: number): readonly NfseDescriptionDocument[] {
  return Array.from({ length: total }, (_unused, index) => buildDocument(index + 1))
}

function entryOf(document: NfseDescriptionDocument): string {
  return `NF-e ${document.number}/${document.series}`
}

function periodOf(period: string | undefined): string {
  return buildNfseDescription({
    documents: buildDocuments(2),
    maxLength: MAX_LENGTH,
    municipalityName: MUNICIPALITY,
    ...(period === undefined ? {} : { period }),
    template: '{{periodo}}',
  }).description
}

describe('NFS-e description contract', () => {
  test('resolves every variable of the vocabulary', () => {
    const documents = buildDocuments(2)
    const result = buildNfseDescription({
      documents,
      maxLength: MAX_LENGTH,
      municipalityName: MUNICIPALITY,
      observations: 'Coleta em Ribeirão Preto.',
      template:
        'Serviço referente a {{quantidadeNotas}} nota(s): {{notas}}. Observações: {{observacoes}}',
    })

    expect(result.description).toBe(
      `Serviço referente a 2 nota(s): ${entryOf(documents[0] as NfseDescriptionDocument)}; ` +
        `${entryOf(documents[1] as NfseDescriptionDocument)}. ` +
        'Observações: Coleta em Ribeirão Preto.',
    )
    expect(result.listedDocuments).toBe(2)
    expect(result.omittedDocuments).toBe(0)
  })

  test('leaves no gap behind an absent observation', () => {
    const result = buildNfseDescription({
      documents: buildDocuments(1),
      maxLength: MAX_LENGTH,
      municipalityName: MUNICIPALITY,
      template: '{{notas}}. {{observacoes}}',
    })

    expect(result.description).toEndWith('.')
    expect(result.description).not.toContain('  ')
  })

  test('collapses line breaks and control characters into single spaces', () => {
    const result = buildNfseDescription({
      documents: [],
      maxLength: MAX_LENGTH,
      municipalityName: MUNICIPALITY,
      observations: '  Entrega\tagendada  ',
      template: 'Serviço:\n\n{{observacoes}}\r\n',
    })

    expect(result.description).toBe('Serviço: Entrega agendada')
  })

  test('accepts a selection without linked documents', () => {
    const result = buildNfseDescription({
      documents: [],
      maxLength: MAX_LENGTH,
      municipalityName: MUNICIPALITY,
      template: 'Notas vinculadas ({{quantidadeNotas}}): {{notas}}',
    })

    expect(result.description).toBe('Notas vinculadas (0):')
    expect(result.listedDocuments).toBe(0)
    expect(result.omittedDocuments).toBe(0)
  })

  test('refuses an unknown variable and names it', () => {
    let thrown: unknown
    try {
      buildNfseDescription({
        documents: buildDocuments(1),
        maxLength: MAX_LENGTH,
        municipalityName: MUNICIPALITY,
        template: 'Notas: {{notasFiscais}}',
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      code: 'NFSE_DESCRIPTION_TEMPLATE_INVALID',
      status: 422,
    })
    expect((thrown as Error).message).toContain('notasFiscais')
  })

  test('names the note by number and series, never by the access key', () => {
    const result = buildNfseDescription({
      documents: buildDocuments(1),
      maxLength: MAX_LENGTH,
      municipalityName: MUNICIPALITY,
      template: LIST_TEMPLATE,
    })

    expect(result.description).toBe('Transporte das notas: NF-e 000000001/1.')
    expect(result.description).not.toContain('chave')
    expect(result.description).not.toMatch(/\d{44}/u)
  })

  test('truncates on the list boundary and never mid document', () => {
    const documents = buildDocuments(100)
    const result = buildNfseDescription({
      documents,
      maxLength: 200,
      municipalityName: MUNICIPALITY,
      template: LIST_TEMPLATE,
    })

    expect(result.description.length).toBeLessThanOrEqual(200)
    expect(result.listedDocuments).toBeGreaterThan(0)
    expect(result.listedDocuments + result.omittedDocuments).toBe(documents.length)
    expect(result.description).toEndWith(`… e mais ${result.omittedDocuments} notas.`)

    // O corte cai entre notas, nunca dentro de uma: a lista servida é a lista inteira das primeiras.
    const listedText = result.description.slice(
      'Transporte das notas: '.length,
      result.description.indexOf('; …'),
    )
    expect(listedText.split('; ')).toEqual(documents.slice(0, result.listedDocuments).map(entryOf))
    for (const document of documents.slice(result.listedDocuments)) {
      expect(result.description).not.toContain(entryOf(document))
    }
  })

  test('counts every selected note even when the list is truncated', () => {
    const documents = buildDocuments(100)
    const result = buildNfseDescription({
      documents,
      maxLength: 260,
      municipalityName: MUNICIPALITY,
      template: 'Notas ({{quantidadeNotas}}): {{notas}}.',
    })

    expect(result.omittedDocuments).toBeGreaterThan(0)
    expect(result.description).toStartWith('Notas (100):')
  })

  test('says one note in the singular', () => {
    // Orçamento medido: listar as duas custa 41 caracteres, listar uma e resumir a outra custa 40.
    const result = buildNfseDescription({
      documents: buildDocuments(2),
      maxLength: 40,
      municipalityName: MUNICIPALITY,
      template: 'Notas: {{notas}}',
    })

    expect(result.listedDocuments).toBe(1)
    expect(result.omittedDocuments).toBe(1)
    expect(result.description).toEndWith('… e mais 1 nota')
  })

  test('refuses a template that leaves no room for a single note', () => {
    let thrown: unknown
    try {
      buildNfseDescription({
        documents: buildDocuments(5),
        maxLength: 200,
        municipalityName: MUNICIPALITY,
        template: OVERSIZED_TEMPLATE,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      code: 'NFSE_DESCRIPTION_TOO_LONG',
      status: 422,
    })
  })
})

describe('NFS-e description period contract', () => {
  test('writes the municipality of the emission profile', () => {
    const result = buildNfseDescription({
      documents: buildDocuments(1),
      maxLength: MAX_LENGTH,
      municipalityName: MUNICIPALITY,
      template: 'Entregas na cidade de {{municipio}}.',
    })

    expect(result.description).toBe('Entregas na cidade de Ribeirão Preto.')
  })

  test('writes the period exactly as the operator typed it', () => {
    const result = buildNfseDescription({
      documents: buildDocuments(2),
      maxLength: MAX_LENGTH,
      municipalityName: MUNICIPALITY,
      period: '27-07 a 31-07-2026',
      template: 'Entregas na cidade de {{municipio}} {{periodo}}.',
    })

    expect(result.description).toBe('Entregas na cidade de Ribeirão Preto 27-07 a 31-07-2026.')
  })

  /**
   * O texto é do operador: mês por extenso, semana, competência — o domínio não interpreta nem
   * reformata, porque a regra de qual janela cobrar ainda não existe.
   */
  test('does not reformat what the operator typed', () => {
    expect(periodOf('julho/2026')).toBe('julho/2026')
    expect(periodOf('semana 31')).toBe('semana 31')
    expect(periodOf('01/07/2026 a 31/07/2026')).toBe('01/07/2026 a 31/07/2026')
  })

  test('leaves the space blank when the operator typed nothing', () => {
    expect(periodOf('')).toBe('')
    expect(periodOf(undefined)).toBe('')
  })

  /** A data das notas deixou de decidir o período: sem digitação não aparece dia nenhum no texto. */
  test('never derives the period from the selected notes', () => {
    const result = buildNfseDescription({
      documents: buildDocuments(30),
      maxLength: MAX_LENGTH,
      municipalityName: MUNICIPALITY,
      template: 'Entregas {{periodo}}: {{quantidadeNotas}} notas.',
    })

    expect(result.description).toBe('Entregas : 30 notas.')
    expect(result.description).not.toMatch(/\d{2}-\d{2}/u)
  })

  test('keeps the period whole even when the list of notes is truncated', () => {
    const result = buildNfseDescription({
      documents: buildDocuments(100),
      maxLength: 260,
      municipalityName: MUNICIPALITY,
      period: '01-07 a 31-07-2026',
      template: 'Entregas {{periodo}}: {{notas}}.',
    })

    // O período é a janela do serviço prestado, não a das notas que couberam no texto.
    expect(result.omittedDocuments).toBeGreaterThan(0)
    expect(result.description).toStartWith('Entregas 01-07 a 31-07-2026:')
  })

  test('refuses an unknown variable that only looks like the new ones', () => {
    let thrown: unknown
    try {
      buildNfseDescription({
        documents: buildDocuments(1),
        maxLength: MAX_LENGTH,
        municipalityName: MUNICIPALITY,
        template: 'Entregas em {{municipioPrestacao}}.',
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({ code: 'NFSE_DESCRIPTION_TEMPLATE_INVALID' })
    expect((thrown as Error).message).toContain('municipioPrestacao')
  })
})
