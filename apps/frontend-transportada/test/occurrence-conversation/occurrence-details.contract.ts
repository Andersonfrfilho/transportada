/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 279 T6c (RF13): "Ver detalhes" no cabeçalho da conversa da ocorrência. A seção de e-mails do cliente só
 * recebe a forma mascarada e descarta o item malformado; as duas línguas têm as mesmas chaves; e o cabeçalho do
 * fio (contratante e motorista) leva o botão, mesmo quando o dono não manda ação própria.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parseOccurrenceClientEmails } from '../../src/modules/occurrence-conversation/shared/occurrenceClientEmails.service'

const MODULE = resolve(import.meta.dir, '../../src/modules/occurrence-conversation')

function read(path: string): string {
  return readFileSync(resolve(MODULE, path), 'utf8')
}

function keysOf(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('e-mails do cliente no detalhe (spec 279 RF1)', () => {
  test('lê o endereço mascarado e ignora o que não tem a forma esperada', () => {
    const emails = parseOccurrenceClientEmails({
      data: [
        { addressMasked: 'f***@m***.com', id: 'e1', label: 'Financeiro', purpose: 'boleto' },
        { addressMasked: 'x***@y***.com', id: 'e2', label: 1, purpose: 'boleto' },
        'lixo',
      ],
    })
    expect(emails).toEqual([
      { addressMasked: 'f***@m***.com', id: 'e1', label: 'Financeiro', purpose: 'boleto' },
    ])
  })

  test('resposta sem lista vira lista vazia, nunca exceção', () => {
    expect(parseOccurrenceClientEmails({})).toEqual([])
    expect(parseOccurrenceClientEmails(null)).toEqual([])
  })

  test('nenhum campo da resposta lida guarda o endereço em claro', () => {
    const [email] = parseOccurrenceClientEmails({
      data: [
        {
          address: 'fulano@mercado.com',
          addressMasked: 'f***@m***.com',
          id: 'e1',
          label: '',
          purpose: 'boleto',
        },
      ],
    })
    expect(JSON.stringify(email)).not.toContain('fulano@mercado.com')
  })
})

describe('"Ver detalhes" na conversa (spec 279 RF13)', () => {
  test('o cabeçalho do fio sempre leva o botão, ao lado da ação do dono', () => {
    const source = read('components/OccurrenceThread.component.tsx')
    expect(source).toContain('<OccurrenceDetailsAction')
    expect(source).toMatch(
      /headerActions=\{[\s\S]*\{headerActions\}[\s\S]*<OccurrenceDetailsAction/u,
    )
  })

  test('painel de lado no desktop e folha abaixo de 40rem', () => {
    const source = read('components/OccurrenceDetailsAction.component.tsx')
    expect(source).toContain("useMinWidth('40rem')")
    expect(source).toContain('styles.sheet')
    expect(source).toContain('styles.side')
  })

  test('o espaço do estado de envio (T6b) está pronto e vazio por padrão', () => {
    const source = read('components/OccurrenceDetailsPanel.component.tsx')
    expect(source).toContain('sendState?: ReactNode')
    expect(source).toContain('sendState === undefined ? null')
  })

  test('as duas línguas têm as mesmas chaves em `details`', () => {
    const pt = JSON.parse(read('locales/occurrenceConversation.locale.json')) as {
      details: unknown
    }
    const en = JSON.parse(read('locales/occurrenceConversation.en.locale.json')) as {
      details: unknown
    }
    expect(keysOf(en.details)).toEqual(keysOf(pt.details))
  })
})
