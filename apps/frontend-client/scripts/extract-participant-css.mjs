/* Copyright (c) 2026 Ada Technology. MIT License. */
// Copia só as regras `.cv-p-*` do styles.css do pacote: o resto traz `:root` e `:where(*)` globais (ADR-0073 §1).
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SOURCE = require.resolve('@adatechnology/conversations-ui/styles.css')
const TARGET = new URL('../src/styles/participantConversation.css', import.meta.url)
const NAMESPACE = /[.]cv-p(?![A-Za-z0-9_])|[.]cv-p-/

function splitTopLevel(css) {
  const blocks = []
  let depth = 0
  let start = 0
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        blocks.push(css.slice(start, index + 1).trim())
        start = index + 1
      }
    }
  }
  return blocks.filter((block) => block !== '')
}

function isParticipantSelector(prelude) {
  return prelude.split(',').every((selector) => NAMESPACE.test(selector))
}

function filterBlock(block) {
  const open = block.indexOf('{')
  const prelude = block.slice(0, open).trim()
  if (prelude.startsWith('@keyframes')) return prelude.includes('cv-p-') ? block : undefined
  if (prelude.startsWith('@media')) {
    const inner = splitTopLevel(block.slice(open + 1, block.lastIndexOf('}')))
      .map(filterBlock)
      .filter((item) => item !== undefined)
    return inner.length === 0 ? undefined : `${prelude} {\n${inner.join('\n')}\n}`
  }
  if (prelude.startsWith('@')) return undefined
  return isParticipantSelector(prelude) ? block : undefined
}

const kept = splitTopLevel(await readFile(SOURCE, 'utf8'))
  .map(filterBlock)
  .filter((block) => block !== undefined)
const header = `/* Copyright (c) 2026 Ada Technology. MIT License. */\n/* GERADO por scripts/extract-participant-css.mjs a partir do CSS publicado do pacote conversations-ui — não editar. */\n`
await writeFile(TARGET, `${header}${kept.join('\n')}\n`)
console.log(`${kept.length} blocos .cv-p-* copiados`)
