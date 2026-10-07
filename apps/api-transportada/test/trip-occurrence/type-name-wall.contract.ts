/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.5 (CA03), a parede: nenhum código das apps ramifica pelo NOME do tipo de ocorrência nem
 * por um contratante específico. Quem decide é a configuração (modos, escopo, linha de item, exceção
 * de contratante/destinatário).
 *
 * ⚠️ **A parede afirma comportamento, não só texto.** O detector é provado contra fontes que violam
 * (acha) e contra fontes limpas (cala) — sem isso, um detector quebrado passaria a árvore inteira
 * verde. O comportamento das regras, com nome igual e configuração diferente, está em
 * `configuration-decides.contract.ts` e na integração `occurrence-configuration-decides`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, test } from 'bun:test'

import type { OccurrenceTypeNameViolation } from '../fixtures/occurrence-type-name-branch.fixture.js'
import {
  findOccurrenceTypeNameViolations,
  OCCURRENCE_TYPE_NAME_VIOLATION,
  stripComments,
} from '../fixtures/occurrence-type-name-branch.fixture.js'

const MONOREPO_ROOT = new URL('../../../../', import.meta.url).pathname
const SCANNED_SOURCE_ROOTS: string[] = [
  'apps/api-transportada/src',
  'apps/frontend-transportada/src',
  'apps/frontend-driver/src',
  'apps/frontend-client/src',
]
const SOURCE_FILE = /\.(?:ts|tsx)$/u
const TEST_FILE = /\.(?:test|spec)\.tsx?$/u

/**
 * Os únicos arquivos com nome de tipo em literal: o catálogo que a empresa recebe de bootstrap e a
 * bancada local. São **dados semeados** — o nome vira linha em `company_occurrence_types` e dali em
 * diante é a configuração da linha que vale; nenhum deles decide comportamento.
 */
const SEED_DATA_FILES: ReadonlySet<string> = new Set([
  'apps/api-transportada/src/database/local-occurrence-type-seed.service.ts',
  'apps/api-transportada/src/shared/occurrence-type-catalog.constant.ts',
  'apps/api-transportada/src/shared/trip-occurrence.constant.ts',
])

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) ? [path] : []
  })
}

function scan(sourceRoot: string) {
  return listSourceFiles(join(MONOREPO_ROOT, sourceRoot)).map((path) => ({
    path: relative(MONOREPO_ROOT, path),
    violations: findOccurrenceTypeNameViolations(readFileSync(path, 'utf8')),
  }))
}

describe('nenhum código ramifica pelo nome do tipo nem por contratante específico (CA03)', () => {
  test.each(SCANNED_SOURCE_ROOTS)('%s: nada fora dos dados semeados', (sourceRoot) => {
    const scanned = scan(sourceRoot)

    expect(scanned.length).toBeGreaterThan(20)
    const offenders = scanned.filter(
      (file) => file.violations.length > 0 && !SEED_DATA_FILES.has(file.path),
    )
    expect(offenders).toEqual([])
  })

  test('a lista dos dados semeados não envelhece: cada arquivo dela ainda tem o nome em literal', () => {
    const scanned = SCANNED_SOURCE_ROOTS.flatMap(scan)

    for (const path of SEED_DATA_FILES) {
      const file = scanned.find((candidate) => candidate.path === path)
      expect(file?.violations).toContain(OCCURRENCE_TYPE_NAME_VIOLATION.catalogLiteral)
    }
  })
})

describe('o detector acha a violação e cala diante do código limpo (a parede tem dentes)', () => {
  const VIOLATIONS: {
    readonly expected: OccurrenceTypeNameViolation
    readonly label: string
    readonly source: string
  }[] = [
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.nameComparison,
      label: 'nome do tipo comparado com literal',
      source: "if (occurrenceType.name === 'Qualquer nome') requirements.noteMode = 'required'",
    },
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.nameComparison,
      label: 'literal à esquerda, `!==`',
      source: "const isSpecial = 'Outro nome' !== type.name",
    },
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.nameComparison,
      label: 'typeName com crase',
      source: 'return typeName === `Qualquer nome` ? a : b',
    },
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.nameSwitch,
      label: 'switch sobre o nome',
      source: "switch (occurrenceType.name) { case 'x': return 1 }",
    },
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.clientDomainWord,
      label: 'contratante específico no identificador',
      source: 'const SPANI_CONTRACTOR_TAX_ID = value',
    },
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.clientDomainWord,
      label: 'devolução como condição, com acento',
      source: "if (reason === 'devolução') return",
    },
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.clientDomainWord,
      label: 'devolução em teste de expressão regular',
      source: 'const isReturn = /devolução/i.test(description)',
    },
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.clientDomainWord,
      label: 'prorrogação em includes',
      source: "const isExtension = description.includes('prorrogação')",
    },
    {
      expected: OCCURRENCE_TYPE_NAME_VIOLATION.catalogLiteral,
      label: 'nome do catálogo em literal',
      source: "const isRefusal = typeKey === 'recusa_total'",
    },
  ]

  test.each(VIOLATIONS)('acha: $label', ({ expected, source }) => {
    expect(findOccurrenceTypeNameViolations(source)).toContain(expected)
  })

  test.each([
    { label: 'nome vazio é verificação de dado, não de regra', source: "user.name === ''" },
    { label: 'nome comparado com variável', source: 'if (type.name === otherType.name) return' },
    { label: 'guarda de tipo sobre o nome', source: "typeof candidate.name === 'string'" },
    { label: 'texto exibido com a palavra', source: "const label = 'Motivo da devolução'" },
    {
      label: 'o nome só é exibido',
      source: 'return <h5>{type.name}</h5>',
    },
    {
      label: 'a decisão lê a configuração',
      source: "if (requirements.referenceNumberMode === 'required') throw error",
    },
    {
      label: 'comentário com o nome não conta',
      source: "// Devolução parcial e SPANI\n/* switch (type.name) { case 'x': } */\nconst a = 1",
    },
  ])('cala: $label', ({ source }) => {
    expect(findOccurrenceTypeNameViolations(source)).toEqual([])
  })

  test('o comentário sai, o literal com barras e aspas fica', () => {
    const stripped = stripComments('const url = \'http://x//y\' // fim\nconst b = "/* nao */"')

    expect(stripped).toContain("'http://x//y'")
    expect(stripped).toContain('"/* nao */"')
    expect(stripped).not.toContain('fim')
  })
})
