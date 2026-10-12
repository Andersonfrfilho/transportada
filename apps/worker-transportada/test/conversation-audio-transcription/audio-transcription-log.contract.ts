/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 D10 / T3.3: a transcrição é dado pessoal e nunca vai para log, erro ou métrica. Dois
 * guardas: o comportamento (todo caminho, inclusive os de erro) e o texto de fonte (mutação: quem
 * passar `text` a um log reprova aqui).
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { createAudioRowProcessor } from '../../src/conversation-audio-transcription/application/audio-row-processor.js'
import { createAudioTranscriptionRunner } from '../../src/conversation-audio-transcription/application/audio-transcription.runner.js'
import { SpeechToTextError } from '../../src/conversation-audio-transcription/application/speech-to-text.port.js'
import { buildFakeRow, createFakeQueue } from '../fixtures/audio-transcription-queue.fixture.js'

const SECRET = 'Joao da Silva CPF 123.456.789-09 rua das Flores 10'
const BYTES = new Uint8Array([9, 9, 9])
const SHA = createHash('sha256').update(BYTES).digest('hex')
const NOW = new Date('2026-10-12T12:00:00.000Z')
const SOURCE_ROOT = join(import.meta.dir, '../../src/conversation-audio-transcription')

async function runAllPaths(): Promise<string> {
  const lines: unknown[] = []
  const logger = {
    error: (...args: unknown[]) => lines.push(args),
    info: (...args: unknown[]) => lines.push(args),
    warn: (...args: unknown[]) => lines.push(args),
  }
  const behaviors: ReadonlyArray<() => Promise<{ text: string }>> = [
    async () => ({ text: SECRET }),
    async () => {
      throw new Error(SECRET)
    },
    async () => {
      throw new SpeechToTextError({ failureCode: 'engine_failed', isRetriable: true })
    },
    async () => ({ text: `${SECRET}\u0000` }),
  ]
  for (const behavior of behaviors) {
    const rows = [buildFakeRow({ sha256: SHA, nextAttemptAt: new Date(NOW.getTime() - 1) })]
    const queue = createFakeQueue({ now: () => NOW, rows })
    const processor = createAudioRowProcessor({
      logger,
      maxDurationMs: 600_000,
      meter: { measure: async () => 1_000 },
      now: () => NOW,
      objectReader: { read: async () => BYTES },
      queue,
      speechToText: {
        transcribe: async () => {
          const { text } = await behavior()
          return { engine: 'whisper.cpp', language: 'pt', model: null, text }
        },
      },
    })
    const runner = createAudioTranscriptionRunner({
      batchSize: 1,
      leaseMs: 600_000,
      logger,
      now: () => NOW,
      processor,
      queue,
    })
    runner.start()
    await runner.whenIdle()
  }
  return JSON.stringify(lines)
}

function listSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? listSources(path) : path.endsWith('.ts') ? [path] : []
  })
}

describe('nenhum log com texto da transcrição (spec 264 D10)', () => {
  test('o texto, o dado pessoal e os bytes não aparecem em nenhum log, em nenhum caminho', async () => {
    const output = await runAllPaths()
    expect(output).not.toContain('Joao')
    expect(output).not.toContain('123.456.789-09')
    expect(output).not.toContain('Flores')
    expect(output).not.toContain('9,9,9')
  })

  test('texto de fonte: nenhuma chamada de log em src/conversation-audio-transcription passa text, bytes ou transcription', () => {
    const offenders: string[] = []
    for (const file of listSources(SOURCE_ROOT)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        if (!/safeLog(Info|Warn|Error)|logger\.(info|warn|error)\(/u.test(line)) return
        const block = lines.slice(index, index + 8).join('\n')
        const metadata = /metadata:\s*\{[^}]*\}|\([^)]*\{[^}]*\}\)/su.exec(block)?.[0] ?? ''
        if (/\b(text|bytes|transcription|body)\b\s*[,:}]/u.test(metadata)) {
          offenders.push(`${file}:${index + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  test('o código-fonte existe (guarda contra o teste passar no vazio)', () => {
    expect(listSources(SOURCE_ROOT).length).toBeGreaterThan(5)
  })
})
