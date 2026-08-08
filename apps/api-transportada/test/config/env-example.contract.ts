/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

// O CI faz `set -a; . ./.env` antes das integrações. Valor com espaço ou `*` sem aspas vira glob
// e derruba o step inteiro — foi assim que `SCHEDULED_DISTRIBUTION_CRON=0 * * * *` quebrou o gate.
const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const ENV_EXAMPLE_PATH = new URL('.env.example', REPOSITORY_ROOT)
const DECLARATION_PATTERN = /^([A-Z][A-Z0-9_]*)=(.*)$/
const FIELD_SEPARATOR = '\u001f'

type Declaration = Readonly<{ key: string; value: string }>

type ShellResult = Readonly<{ exitCode: number; stderr: string; stdout: string }>

function stripSurroundingQuotes(value: string): string {
  const first = value.at(0)
  if (first !== "'" && first !== '"') return value
  if (value.length < 2 || !value.endsWith(first)) return value
  return value.slice(1, -1)
}

function readDeclarations(content: string): readonly Declaration[] {
  return content
    .split('\n')
    .map((line) => DECLARATION_PATTERN.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      key: match[1] as string,
      value: stripSurroundingQuotes(match[2] as string),
    }))
}

async function sourceWithPosixShell(keys: readonly string[]): Promise<ShellResult> {
  const printers = keys
    .map((key) => `printf '%s${FIELD_SEPARATOR}%s\\n' '${key}' "\${${key}}"`)
    .join('\n')
  const shell = Bun.spawn(['sh', '-c', `set -a\n. ./.env.example\nset +a\n${printers}`], {
    cwd: REPOSITORY_ROOT.pathname,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(shell.stdout).text(),
    new Response(shell.stderr).text(),
    shell.exited,
  ])
  return { exitCode, stderr, stdout }
}

function readSourcedValues(stdout: string): ReadonlyMap<string, string> {
  return new Map(
    stdout
      .split('\n')
      .filter((line) => line.includes(FIELD_SEPARATOR))
      .map((line) => {
        const separatorIndex = line.indexOf(FIELD_SEPARATOR)
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)] as const
      }),
  )
}

/**
 * Desligado é o padrão, e o padrão precisa estar escrito: variável de observabilidade que só existe
 * no schema não é descoberta por quem for preencher o ambiente.
 */
const OBSERVABILITY_KEYS = ['LOG_SINK_URL', 'SENTRY_DSN', 'SENTRY_ENVIRONMENT'] as const

describe('contrato do .env.example', () => {
  test('as variáveis de observabilidade são declaradas, e vazias', async () => {
    const declarations = readDeclarations(await Bun.file(ENV_EXAMPLE_PATH).text())

    for (const key of OBSERVABILITY_KEYS) {
      const declaration = declarations.find((candidate) => candidate.key === key)
      expect(`${key}=${declaration?.value}`).toBe(`${key}=`)
    }
  })

  test('todo valor sobrevive ao `. ./.env` que o CI executa', async () => {
    const declarations = readDeclarations(await Bun.file(ENV_EXAMPLE_PATH).text())
    expect(declarations.length).toBeGreaterThan(0)

    const shell = await sourceWithPosixShell(declarations.map((declaration) => declaration.key))
    expect(`${shell.exitCode} ${shell.stderr}`.trim()).toBe('0')

    const sourced = readSourcedValues(shell.stdout)
    for (const declaration of declarations) {
      expect(`${declaration.key}=${sourced.get(declaration.key)}`).toBe(
        `${declaration.key}=${declaration.value}`,
      )
    }
  })
})
