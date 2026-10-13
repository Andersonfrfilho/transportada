/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const WHISPER_TAG = 'v1.9.4'
const WHISPER_COMMIT = '927cfce34f31707e17f2bff35c349632fb9e2c3a'
const MODEL_SHA256 = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'
const MODEL_FILE = 'ggml-small-q5_1.bin'
const MODEL_PATH = `/models/${MODEL_FILE}`

const dockerfile = await Bun.file(new URL('../Dockerfile', import.meta.url)).text()
const railwayConfig = await Bun.file(
  new URL('../../../.railway/railway.ts', import.meta.url),
).text()
const environmentSchema = await Bun.file(
  new URL('../src/config/environment.schema.ts', import.meta.url),
).text()

function finalStage(source: string): string {
  const stages = source.split(/^FROM /mu)
  return stages[stages.length - 1] ?? ''
}

function serviceBlock(name: string): string {
  const start = railwayConfig.indexOf(`const ${name} = service(`)
  const end = railwayConfig.indexOf('\n  })\n', start)
  return railwayConfig.slice(start, end)
}

describe('worker image: whisper.cpp, ffmpeg and model (ADR-0103)', () => {
  test('builds whisper-cli from a pinned tag and fails on a commit mismatch', () => {
    expect(dockerfile).toContain(`ARG WHISPER_TAG=${WHISPER_TAG}`)
    expect(dockerfile).toContain('--branch "$WHISPER_TAG"')
    expect(dockerfile).toContain('ggml-org/whisper.cpp')
    expect(dockerfile).toContain(`ARG WHISPER_COMMIT=${WHISPER_COMMIT}`)
    expect(dockerfile).toContain('rev-parse HEAD)" = "$WHISPER_COMMIT"')
    expect(dockerfile).not.toMatch(/--branch (master|main)\b/u)
  })

  test('compiles Release, without GPU and without host-native instructions', () => {
    for (const flag of [
      '-DCMAKE_BUILD_TYPE=Release',
      '-DGGML_NATIVE=OFF',
      '-DGGML_AVX=ON',
      '-DGGML_AVX2=ON',
      '-DGGML_FMA=ON',
      '-DGGML_F16C=ON',
      '-DBUILD_SHARED_LIBS=OFF',
    ]) {
      expect(dockerfile).toContain(flag)
    }
  })

  test('downloads the model and verifies its sha256 so a divergent file fails the build', () => {
    expect(dockerfile).toContain(`ARG WHISPER_MODEL=${MODEL_FILE}`)
    expect(dockerfile).toContain(`ARG WHISPER_MODEL_SHA256=${MODEL_SHA256}`)
    expect(dockerfile).toMatch(/sha256sum -c/u)
  })

  test('final stage installs ffmpeg and ships the binary and the model under /models', () => {
    const runtime = finalStage(dockerfile)
    expect(runtime).toMatch(/apk add --no-cache[^\n]*\bffmpeg\b/u)
    expect(runtime).toContain('/usr/local/bin/whisper-cli')
    expect(runtime).toContain('COPY --from=whisper')
    expect(runtime).toMatch(/--chown=transportada:transportada[^\n]*\/models/u)
  })

  test('final stage carries no build tools', () => {
    const runtime = finalStage(dockerfile)
    for (const tool of ['build-base', 'cmake', 'git', 'curl', 'gcc', 'make']) {
      expect(runtime).not.toMatch(new RegExp(`apk add[^\\n]*\\b${tool}\\b`, 'u'))
    }
  })

  test('final stage keeps the worker entrypoint and runtime user', () => {
    const runtime = finalStage(dockerfile)
    expect(runtime).toContain('USER transportada')
    expect(runtime).toContain('CMD ["bun", "./dist/main.js"]')
  })
})

describe('railway.ts: transcription variables', () => {
  const worker = serviceBlock('worker')
  const api = serviceBlock('api')

  test('worker declares every transcription variable the worker schema reads', () => {
    const schemaNames = [
      ...environmentSchema.matchAll(/^\s+(AUDIO_TRANSCRIPTION_[A-Z_]+):/gmu),
    ].map((match) => match[1] ?? '')
    expect(schemaNames.length).toBe(6)
    for (const name of schemaNames) {
      expect(worker).toContain(`${name}:`)
    }
  })

  test('worker values follow the ADR-0103 measurements', () => {
    expect(worker).toContain(
      `AUDIO_TRANSCRIPTION_MODEL_PATH: isProduction ? preserve() : '${MODEL_PATH}'`,
    )
    expect(worker).toMatch(/AUDIO_TRANSCRIPTION_THREADS: preserve\(\)/u)
    expect(worker).toContain("AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '600000'")
    expect(worker).toContain("AUDIO_TRANSCRIPTION_BATCH_SIZE: '2'")
    expect(worker).toContain("AUDIO_TRANSCRIPTION_TIMEOUT_MS: '300000'")
    expect(worker).toContain("AUDIO_TRANSCRIPTION_RECOVERY_WINDOW_HOURS: '72'")
  })

  test('api declares only the duration ceiling it shows to the panel', () => {
    expect(api).toContain("AUDIO_TRANSCRIPTION_MAX_DURATION_MS: '600000'")
    expect(api).not.toContain('AUDIO_TRANSCRIPTION_MODEL_PATH')
  })
})
