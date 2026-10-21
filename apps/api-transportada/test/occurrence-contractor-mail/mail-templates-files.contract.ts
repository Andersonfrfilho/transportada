/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T4.2 (ADR-0110 §2, §3, §12; D2, D3, D12): os cinco modelos `.html` do e-mail de ocorrência passam na
 * mesma validação que o módulo de notificação recebe, têm só variáveis do catálogo, uma área de mensagem e nenhum
 * layout que o cliente de e-mail não aceita (grid, flex, `var(`, `<script`, `@import`).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { OCCURRENCE_CONTRACTOR_MAIL_VARIABLE_NAMES } from '../../src/occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import {
  assessContractorTemplate,
  blocksContractorMailSend,
} from '../../src/occurrence-conversation/domain/occurrence-contractor-template.policy.js'

const TEMPLATES_DIR = new URL(
  '../../src/occurrence-conversation/occurrence-mail-templates/',
  import.meta.url,
)

type TemplateFile = {
  readonly hasItems: boolean
  readonly key: string
  readonly name: string
}

const FILES: readonly TemplateFile[] = [
  { hasItems: false, key: 'ocorrencia.prorrogacao-boleto', name: 'prorrogacao-boleto' },
  { hasItems: true, key: 'ocorrencia.avaria', name: 'avaria' },
  { hasItems: true, key: 'ocorrencia.devolucao', name: 'devolucao' },
  { hasItems: false, key: 'ocorrencia.entrega-nao-realizada', name: 'entrega-nao-realizada' },
  { hasItems: true, key: 'ocorrencia.recusa', name: 'recusa' },
]

const OPEN = '<!-- mensagem -->'
const CLOSE = '<!-- /mensagem -->'
const SYSTEM_HTML_KEY_REGEX =
  /\{\{\s*(?:logoTransportadora|tabelaItens|marcasRodape|faixaResposta)\s*\}\}/u
const SUBJECT_LINE_REGEX = /^<!-- subject: (.+) -->\r?\n/u

function readTemplate(name: string): string {
  return readFileSync(new URL(`${name}.html`, TEMPLATES_DIR), 'utf8')
}

/** O arquivo traz o assunto na primeira linha; o corpo é o resto (é o que o módulo recebe como `body`). */
function splitFile(file: string): { readonly body: string; readonly subject: string } {
  const match = SUBJECT_LINE_REGEX.exec(file)
  if (match === null) throw new Error('primeira linha sem <!-- subject: … -->')
  return { body: file.slice(match[0].length), subject: match[1] ?? '' }
}

/** A área de mensagem como o par do arquivo: o conteúdo entre os dois comentários, uma vez só. */
function messageArea(body: string): {
  readonly content: string
  readonly end: number
  readonly start: number
} {
  const opens = body.split(OPEN).length - 1
  const closes = body.split(CLOSE).length - 1
  expect(opens).toBe(1)
  expect(closes).toBe(1)
  const start = body.indexOf(OPEN)
  const end = body.indexOf(CLOSE) + CLOSE.length
  expect(start).toBeLessThan(end)
  return { content: body.slice(start + OPEN.length, end - CLOSE.length), end, start }
}

function variablesIn(text: string): readonly string[] {
  return [...text.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/gu)].map((match) => match[1] ?? '')
}

describe('spec 272 T4.2: os cinco modelos .html do e-mail de ocorrência', () => {
  for (const file of FILES) {
    describe(file.name, () => {
      const source = readTemplate(file.name)
      const { body, subject } = splitFile(source)

      test('a primeira linha traz o assunto', () => {
        expect(source.startsWith('<!-- subject:')).toBe(true)
        expect(subject.trim()).not.toBe('')
      })

      test('passa na validação do envio (D2), sem problema algum e sem variável fora do catálogo', () => {
        const problems = assessContractorTemplate({
          key: file.key,
          template: { body, subject },
        })
        expect(problems).toEqual([])
        expect(blocksContractorMailSend(problems)).toBe(false)
        expect(problems.some((problem) => problem.code === 'unknown_variables')).toBe(false)
      })

      test('todas as variáveis, no assunto e no corpo, existem no catálogo', () => {
        const unknown = [...variablesIn(subject), ...variablesIn(body)].filter(
          (name) => !OCCURRENCE_CONTRACTOR_MAIL_VARIABLE_NAMES.has(name),
        )
        expect(unknown).toEqual([])
      })

      test('tem exatamente um par de área de mensagem, sem chave de HTML do sistema dentro', () => {
        const area = messageArea(body)
        expect(SYSTEM_HTML_KEY_REGEX.test(area.content)).toBe(false)
        expect(area.content.trim()).not.toBe('')
      })

      test('o cabeçalho põe o logo antes do nome de exibição', () => {
        const logo = body.indexOf('{{logoTransportadora}}')
        const name = body.indexOf('{{nomeExibicao}}')
        expect(logo).toBeGreaterThan(-1)
        expect(name).toBeGreaterThan(logo)
      })

      test('valorNota e cnpjContratante ocupam a própria célula', () => {
        expect(body).toMatch(/<td[^>]*>\s*\{\{valorNota\}\}\s*<\/td>/u)
        expect(body).toMatch(/<td[^>]*>\s*\{\{cnpjContratante\}\}\s*<\/td>/u)
      })

      test('tem a assinatura e o rodapé do sistema', () => {
        for (const name of [
          'logoAssinatura',
          'assinaturaNome',
          'assinaturaCargo',
          'cidadeTransportadora',
          'razaoSocialTransportadora',
          'faixaResposta',
          'marcasRodape',
          'data',
        ]) {
          expect(body).toContain(`{{${name}}}`)
        }
      })

      test('tabelas e estilos inline: sem grid, flex, var(, script ou @import; largura 620', () => {
        expect(body).not.toMatch(/display:\s*(grid|flex)/u)
        expect(body).not.toMatch(/var\(/u)
        expect(body).not.toMatch(/<script/iu)
        expect(body).not.toMatch(/@import/u)
        expect(body).toMatch(/620/u)
      })

      test(`tabelaItens ${file.hasItems ? 'fica fora da área, uma vez' : 'não aparece'}`, () => {
        const occurrences = body.split('{{tabelaItens}}').length - 1
        if (!file.hasItems) {
          expect(occurrences).toBe(0)
          return
        }
        expect(occurrences).toBe(1)
        const area = messageArea(body)
        const at = body.indexOf('{{tabelaItens}}')
        expect(at < area.start || at >= area.end).toBe(true)
      })
    })
  }
})
