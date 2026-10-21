/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T4.3 (ADR-0110 §13, D14): a lógica pura do script que publica os modelos do e-mail de ocorrência — o
 * arquivo vira assunto + corpo, o plano diz create/same/differs por chave, e só o que o operador pediu é gravado.
 */
import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_MAIL_TEMPLATE_CHANNEL,
  OCCURRENCE_MAIL_TEMPLATE_LOCALE,
  parsePublishArguments,
  parseTemplateFile,
  planOccurrenceMailTemplatePublication,
  publishOccurrenceMailTemplates,
  readOccurrenceMailTemplateFiles,
  type OccurrenceMailTemplatePublishRepository,
} from '../../src/occurrence-conversation/application/occurrence-mail-templates-publish.service.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const REAL = readOccurrenceMailTemplateFiles()[0]
if (REAL === undefined) throw new Error('sem modelos')
const BODY = REAL.body
const FILE = `<!-- subject: Recusa — NF {{numeroNota}} -->\n${BODY}`

type Row = { body: string; key: string; subject: null | string; version: number }

function memoryRepository(rows: Row[]): OccurrenceMailTemplatePublishRepository & {
  readonly writes: string[]
} {
  const writes: string[] = []
  return {
    findActive: async ({ channel, key, locale }) => {
      expect(channel).toBe('email')
      expect(locale).toBe('pt-BR')
      return rows.filter((row) => row.key === key).sort((a, b) => b.version - a.version)[0]
    },
    upsert: async (input) => {
      const version =
        Math.max(0, ...rows.filter((row) => row.key === input.key).map((r) => r.version)) + 1
      const row = { body: input.body, key: input.key, subject: input.subject ?? null, version }
      rows.push(row)
      writes.push(input.key)
      expect(input.active).toBe(true)
      expect(input.companyId).toBe(COMPANY_ID)
      return row
    },
    writes,
  }
}

describe('parseTemplateFile (spec 272 T4.3)', () => {
  test('separa o assunto da linha 1 do corpo', () => {
    expect(parseTemplateFile(FILE)).toEqual({ body: BODY, subject: 'Recusa — NF {{numeroNota}}' })
  })

  test('sem a linha de assunto é erro', () => {
    expect(() => parseTemplateFile(BODY)).toThrow()
  })
})

describe('os cinco arquivos reais (spec 272 T4.3)', () => {
  test('chave = ocorrencia. + nome do arquivo, e os cinco passam na validação', () => {
    const templates = readOccurrenceMailTemplateFiles()
    expect(templates.map((template) => template.key).sort()).toEqual([
      'ocorrencia.avaria',
      'ocorrencia.devolucao',
      'ocorrencia.entrega-nao-realizada',
      'ocorrencia.prorrogacao-boleto',
      'ocorrencia.recusa',
    ])
    const plan = planOccurrenceMailTemplatePublication({
      active: new Map(),
      overwrite: [],
      templates,
    })
    expect(plan.invalid).toEqual([])
  })
})

describe('planOccurrenceMailTemplatePublication (spec 272 T4.3)', () => {
  const templates = [{ ...parseTemplateFile(FILE), key: 'ocorrencia.recusa' }]

  test('sem ativa → create; ativa igual → same; ativa diferente → differs', () => {
    const verdict = (
      active: { body: string; subject: null | string; version: number } | undefined,
    ) =>
      planOccurrenceMailTemplatePublication({
        active: new Map([['ocorrencia.recusa', active]]),
        overwrite: [],
        templates,
      }).entries[0]?.verdict
    expect(verdict(undefined)).toBe('create')
    expect(verdict({ body: BODY, subject: 'Recusa — NF {{numeroNota}}', version: 3 })).toBe('same')
    expect(verdict({ body: BODY, subject: 'outro', version: 3 })).toBe('differs')
    expect(verdict({ body: `${BODY}x`, subject: 'Recusa — NF {{numeroNota}}', version: 3 })).toBe(
      'differs',
    )
  })

  test('um arquivo inválido recusa todos: nenhuma entrada, só os problemas', () => {
    const plan = planOccurrenceMailTemplatePublication({
      active: new Map(),
      overwrite: [],
      templates: [
        ...templates,
        {
          body: BODY.replace('<!-- mensagem -->', '<script>x</script><!-- mensagem -->'),
          key: 'ocorrencia.avaria',
          subject: 'x',
        },
      ],
    })
    expect(plan.invalid.map((item) => item.key)).toEqual(['ocorrencia.avaria'])
    expect(plan.entries).toEqual([])
  })

  test('--overwrite com chave desconhecida é erro', () => {
    expect(() =>
      planOccurrenceMailTemplatePublication({
        active: new Map(),
        overwrite: ['ocorrencia.nada'],
        templates,
      }),
    ).toThrow()
  })
})

describe('publishOccurrenceMailTemplates (spec 272 T4.3)', () => {
  const templates = [
    { ...parseTemplateFile(FILE), key: 'ocorrencia.recusa' },
    { ...parseTemplateFile(FILE), key: 'ocorrencia.avaria' },
  ]

  test('sem confirm não grava; com confirm grava só create', async () => {
    const rows: Row[] = [
      { body: 'personalizado', key: 'ocorrencia.avaria', subject: 's', version: 4 },
    ]
    const repository = memoryRepository(rows)
    const dry = await publishOccurrenceMailTemplates({
      companyId: COMPANY_ID,
      confirm: false,
      overwrite: [],
      repository,
      templates,
    })
    expect(repository.writes).toEqual([])
    expect(dry.entries.map((e) => [e.key, e.verdict])).toEqual([
      ['ocorrencia.recusa', 'create'],
      ['ocorrencia.avaria', 'differs'],
    ])
    await publishOccurrenceMailTemplates({
      companyId: COMPANY_ID,
      confirm: true,
      overwrite: [],
      repository,
      templates,
    })
    expect(repository.writes).toEqual(['ocorrencia.recusa'])
  })

  test('differs com --overwrite grava versão nova só daquela chave', async () => {
    const rows: Row[] = [
      { body: 'personalizado', key: 'ocorrencia.avaria', subject: 's', version: 4 },
    ]
    const repository = memoryRepository(rows)
    const report = await publishOccurrenceMailTemplates({
      companyId: COMPANY_ID,
      confirm: true,
      overwrite: ['ocorrencia.avaria'],
      repository,
      templates,
    })
    expect(repository.writes.sort()).toEqual(['ocorrencia.avaria', 'ocorrencia.recusa'])
    expect(report.entries.find((e) => e.key === 'ocorrencia.avaria')?.writtenVersion).toBe(5)
  })

  test('canal e locale são email e pt-BR', () => {
    expect(OCCURRENCE_MAIL_TEMPLATE_CHANNEL).toBe('email')
    expect(OCCURRENCE_MAIL_TEMPLATE_LOCALE).toBe('pt-BR')
  })
})

describe('parsePublishArguments (spec 272 T4.3)', () => {
  test('exige --company UUID e junta os --overwrite', () => {
    expect(
      parsePublishArguments([
        '--company',
        COMPANY_ID,
        '--confirm',
        '--overwrite',
        'a',
        '--overwrite',
        'b',
      ]),
    ).toEqual({ companyId: COMPANY_ID, confirm: true, overwrite: ['a', 'b'] })
    expect(() => parsePublishArguments([])).toThrow()
    expect(() => parsePublishArguments(['--company', 'nao-uuid'])).toThrow()
  })
})
