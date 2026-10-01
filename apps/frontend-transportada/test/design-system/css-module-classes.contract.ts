/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Classe de CSS Module que não existe **não quebra a compilação**: o tipo gerado devolve
 * `string | undefined`, então `styles.panel` inexistente vira `className={undefined}` e o
 * componente renderiza sem estilo nenhum, calado.
 *
 * Foi assim que `CargoVolumeFactorPanel` ficou em HTML cru ao lado de um painel estilizado —
 * quatro classes erradas, zero erro, até alguém olhar a tela.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const MODULES_ROOT = resolve(import.meta.dir, '../../src')
const STYLES_IMPORT = /import\s+styles\s+from\s+'(.+?\.module\.css)'/
const CLASS_DEFINITION = /\.([A-Za-z][\w-]*)/g
const CLASS_USAGE = /styles\.([A-Za-z][\w]*)/g

function walk(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

function definedClasses(stylesheet: string): ReadonlySet<string> {
  return new Set(
    [...readFileSync(stylesheet, 'utf8').matchAll(CLASS_DEFINITION)].map((match) => match[1] ?? ''),
  )
}

function missingClasses(component: string): readonly string[] {
  const source = readFileSync(component, 'utf8')
  const imported = STYLES_IMPORT.exec(source)
  if (imported === null) return []
  const stylesheet = resolve(dirname(component), imported[1] ?? '')
  let defined: ReadonlySet<string>
  try {
    defined = definedClasses(stylesheet)
  } catch {
    return []
  }
  const used = new Set([...source.matchAll(CLASS_USAGE)].map((match) => match[1] ?? ''))
  return [...used].filter((name) => !defined.has(name)).sort()
}

/**
 * `cargo-isometric` monta a classe da caixa como `[styles.box, ...modificadores]`, e só os
 * modificadores existem: a aparência base da caixa vem dos atributos `fill`/`stroke` do SVG, não de
 * uma classe. O nome fica na lista porque remover a entrada da composição é decisão de quem
 * desenhou o componente, não desta varredura.
 */
const KNOWN_ABSENT: Readonly<Record<string, readonly string[]>> = {
  'components/ui/cargo-isometric.tsx': ['box'],
}

describe('classes de CSS Module existem na folha importada', () => {
  test('nenhum componente referencia classe inexistente', () => {
    const offenders = walk(MODULES_ROOT)
      .map((component) => {
        const relative = component.slice(MODULES_ROOT.length + 1)
        const allowed = KNOWN_ABSENT[relative] ?? []
        return {
          missing: missingClasses(component).filter((name) => !allowed.includes(name)),
          relative,
        }
      })
      .filter((entry) => entry.missing.length > 0)
      .map((entry) => `${entry.relative}: ${entry.missing.join(', ')}`)

    expect(offenders).toEqual([])
  })
})
