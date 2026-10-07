/* Copyright (c) 2026 Ada Technology. MIT License. */
const APPLICATION_ROOT = new URL('../..', import.meta.url)

export function readStylesheet(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** O corpo do primeiro bloco que abre com `prelude {` no começo de uma linha, chaves internas balanceadas; vazio quando não existe. */
export function readCssBlock(stylesheet: string, prelude: string): string {
  const source = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  const escaped = prelude.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const found = new RegExp(`(?<!,)(?:^|[\\n}])\\s*${escaped} \\{`).exec(source)
  if (found === null) return ''
  let depth = 0
  const bodyStart = found.index + found[0].length
  for (let index = bodyStart - 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart, index)
  }
  return ''
}
