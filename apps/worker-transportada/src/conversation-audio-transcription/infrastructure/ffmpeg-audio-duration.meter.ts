/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  AUDIO_DECODE_TIMEOUT_MS,
  AUDIO_PROBE_TIMEOUT_MS,
} from '../domain/conversation-audio-transcription.constant.js'
import {
  AudioMeasureTimeoutError,
  type AudioDurationMeterPort,
} from '../application/speech-to-text.port.js'

export type AudioCommandResult = {
  readonly exitCode: number | null
  readonly stderr: string
  readonly stdout: string
  readonly timedOut: boolean
}

export type AudioCommandRunner = (params: {
  readonly args: readonly string[]
  readonly command: string
  readonly input: Uint8Array
  readonly timeoutMs: number
}) => Promise<AudioCommandResult>

const OUTPUT_LIMIT_BYTES = 64 * 1024

/** `ffprobe`/`ffmpeg` leem o arquivo (hostil) pelo stdin, sem caminho em disco e sem shell. */
export const runAudioCommand: AudioCommandRunner = async ({ args, command, input, timeoutMs }) => {
  const child = Bun.spawn([command, ...args], {
    stderr: 'pipe',
    stdin: new Blob([Buffer.from(input)]),
    stdout: 'pipe',
  })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readLimited(child.stdout),
      readLimited(child.stderr),
      child.exited,
    ])
    return { exitCode: timedOut ? null : exitCode, stderr, stdout, timedOut }
  } finally {
    clearTimeout(timer)
  }
}

async function readLimited(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (total < OUTPUT_LIMIT_BYTES) chunks.push(value)
    total += value.byteLength
  }
  return new TextDecoder().decode(Buffer.concat(chunks)).slice(0, OUTPUT_LIMIT_BYTES)
}

const FFMPEG_TIME_PATTERN = /time=(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/gu

export function createFfmpegAudioDurationMeter(dependencies: {
  readonly runner: AudioCommandRunner
}): AudioDurationMeterPort {
  return {
    async measure({ bytes, maxDurationMs }) {
      const probed = await probeHeader(dependencies.runner, bytes)
      if (probed !== 'unknown') return probed

      return decodeToMeasure({ bytes, maxDurationMs, runner: dependencies.runner })
    },
  }
}

/** `unknown` = sem duração no cabeçalho (WebM do Chromium); `undefined` = não é áudio. */
async function probeHeader(
  runner: AudioCommandRunner,
  bytes: Uint8Array,
): Promise<number | undefined | 'unknown'> {
  const result = await runner({
    args: [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      '-i',
      'pipe:0',
    ],
    command: 'ffprobe',
    input: bytes,
    timeoutMs: AUDIO_PROBE_TIMEOUT_MS,
  })
  if (result.timedOut) throw new AudioMeasureTimeoutError()
  if (result.exitCode !== 0) return undefined

  const seconds = Number.parseFloat(result.stdout.trim())
  if (!Number.isFinite(seconds)) return 'unknown'
  return seconds > 0 ? Math.round(seconds * 1000) : undefined
}

async function decodeToMeasure(params: {
  readonly bytes: Uint8Array
  readonly maxDurationMs: number
  readonly runner: AudioCommandRunner
}): Promise<number | undefined> {
  const capSeconds = Math.ceil(params.maxDurationMs / 1000) + 1
  const result = await params.runner({
    args: ['-hide_banner', '-nostdin', '-t', String(capSeconds), '-i', 'pipe:0', '-f', 'null', '-'],
    command: 'ffmpeg',
    input: params.bytes,
    timeoutMs: AUDIO_DECODE_TIMEOUT_MS,
  })
  if (result.timedOut) throw new AudioMeasureTimeoutError()

  const times = [...result.stderr.matchAll(FFMPEG_TIME_PATTERN)]
  const last = times.at(-1)
  if (last === undefined) return undefined
  const [, hours = '0', minutes = '0', seconds = '0', fraction = '0'] = last
  const milliseconds =
    ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 +
    Math.round(Number(`0.${fraction}`) * 1000)
  return milliseconds > 0 ? milliseconds : undefined
}
