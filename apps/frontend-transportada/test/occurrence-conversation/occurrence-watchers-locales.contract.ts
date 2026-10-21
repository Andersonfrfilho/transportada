/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 267 (T4.5): todo texto novo existe em pt-BR e em inglês, com as mesmas chaves e os mesmos `{{parâmetros}}`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

type Tree = Readonly<{ [key: string]: Tree | string }>

function read(path: string): Tree {
  return JSON.parse(readFileSync(path, 'utf8')) as Tree
}

function pick(tree: Tree, path: string): Tree | string | undefined {
  return path.split('.').reduce<Tree | string | undefined>((node, key) => {
    return typeof node === 'object' ? node[key] : undefined
  }, tree)
}

function flatten(node: Tree | string | undefined, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>()
  if (node === undefined) return entries
  if (typeof node === 'string') return entries.set(prefix, node)
  for (const [key, child] of Object.entries(node)) {
    for (const [path, text] of flatten(child, prefix === '' ? key : `${prefix}.${key}`)) {
      entries.set(path, text)
    }
  }
  return entries
}

function parametersOf(text: string): readonly string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/gu)].map((match) => match[1] ?? '').toSorted()
}

const SOURCES = [
  {
    english: 'src/modules/occurrence-conversation/locales/occurrenceConversation.en.locale.json',
    paths: [
      'watchers',
      'dialog.copy',
      'dialog.error.CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS',
      'author.copy',
      'author.team',
      'author.teamOnly',
    ],
    portuguese: 'src/modules/occurrence-conversation/locales/occurrenceConversation.locale.json',
  },
  {
    english: 'src/modules/company-settings/locales/companySettings.en.locale.json',
    paths: ['tabs.occurrenceWatchers'],
    portuguese: 'src/modules/company-settings/locales/companySettings.locale.json',
  },
  {
    english: 'src/modules/delivery-clients/locales/contractorDirectory.en.locale.json',
    paths: ['watchers'],
    portuguese: 'src/modules/delivery-clients/locales/contractorDirectory.locale.json',
  },
  {
    english: 'src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json',
    paths: [
      'addressReport.correction.mail.copyLabel',
      'addressReport.correction.mail.copyEmpty',
      'addressReport.correction.mail.copyRemove',
      'addressReport.correction.mail.error.tooManyRecipients',
    ],
    portuguese: 'src/modules/nfe-workspace/locales/nfeWorkspace.locale.json',
  },
] as const

describe('os textos da cópia dos responsáveis em pt-BR e em inglês (spec 267 T4.5)', () => {
  for (const source of SOURCES) {
    test(`${source.portuguese} tem tudo o que o inglês tem, com os mesmos parâmetros`, () => {
      const portuguese = read(source.portuguese)
      const english = read(source.english)

      for (const path of source.paths) {
        const pt = flatten(pick(portuguese, path), path)
        const en = flatten(pick(english, path), path)
        expect(pt.size).toBeGreaterThan(0)
        expect([...en.keys()].toSorted()).toEqual([...pt.keys()].toSorted())
        for (const [key, text] of pt) {
          expect(text.trim()).not.toBe('')
          expect(parametersOf(en.get(key) ?? '')).toEqual(parametersOf(text))
        }
      }
    })
  }
})
