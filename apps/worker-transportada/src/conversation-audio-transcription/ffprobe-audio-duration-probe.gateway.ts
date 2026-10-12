/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_FFMPEG_BINARY,
  DEFAULT_FFPROBE_BINARY,
  DURATION_DECODE_MARGIN_MILLISECONDS,
  DURATION_DECODE_TIMEOUT_MILLISECONDS,
  FFPROBE_TIMEOUT_MILLISECONDS,
  SPEECH_TO_TEXT_FAILURE_KIND,
} from './audio-transcription-engine.constant.js'
import type { AudioDurationProbe, AudioDurationProbeParams } from './audio-duration-probe.port.js'
import {
  runCommandWithTimeout,
  type CommandOutcome,
  type RunCommand,
} from './run-command-with-timeout.js'
import { SpeechToTextError } from './speech-to-text.error.js'

export type FfprobeAudioDurationProbeOptions = {
  readonly ffprobePath?: string
  readonly ffmpegPath?: string
  readonly probeTimeoutMilliseconds?: number
  readonly decodeTimeoutMilliseconds?: number
  readonly runCommand?: RunCommand
}

const MICROSECONDS_PER_MILLISECOND = 1_000
const SECONDS_TO_MILLISECONDS = 1_000
const DECODED_TIME_PATTERN = /^out_time_us=(\d+)$/gmu

const TIMEOUT_ERROR = new SpeechToTextError({
  code: 'engine_timeout',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
})

function failWith(code: 'engine_failed' | 'unsupported_format'): SpeechToTextError {
  return new SpeechToTextError({ code, kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE })
}

/** Prazo estourado é retriável; binário ausente e arquivo que o `ffprobe` recusa não melhoram tentando de novo. */
function readStdout(outcome: CommandOutcome): string {
  if (outcome.outcome === 'timed_out') throw TIMEOUT_ERROR
  if (outcome.outcome === 'spawn_failed') throw failWith('engine_failed')
  if (outcome.exitCode !== 0) throw failWith('unsupported_format')
  return outcome.stdout
}

function parseHeaderDuration(stdout: string): number | undefined {
  const seconds = Number(stdout.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return Math.round(seconds * SECONDS_TO_MILLISECONDS)
}

function parseDecodedDuration(stdout: string): number | undefined {
  const matches = [...stdout.matchAll(DECODED_TIME_PATTERN)]
  const lastMatch = matches.at(-1)
  if (lastMatch?.[1] === undefined) return undefined
  return Math.round(Number(lastMatch[1]) / MICROSECONDS_PER_MILLISECOND)
}

export function createFfprobeAudioDurationProbe(
  options: FfprobeAudioDurationProbeOptions = {},
): AudioDurationProbe {
  const ffprobePath = options.ffprobePath ?? DEFAULT_FFPROBE_BINARY
  const ffmpegPath = options.ffmpegPath ?? DEFAULT_FFMPEG_BINARY
  const probeTimeout = options.probeTimeoutMilliseconds ?? FFPROBE_TIMEOUT_MILLISECONDS
  const decodeTimeout = options.decodeTimeoutMilliseconds ?? DURATION_DECODE_TIMEOUT_MILLISECONDS
  const runCommand = options.runCommand ?? runCommandWithTimeout

  async function readHeaderDuration(filePath: string): Promise<number | undefined> {
    const outcome = await runCommand({
      args: [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      command: ffprobePath,
      timeoutMilliseconds: probeTimeout,
    })
    return parseHeaderDuration(readStdout(outcome))
  }

  async function decodeDuration(
    filePath: string,
    maxDurationMilliseconds: number,
  ): Promise<number> {
    const cap =
      (maxDurationMilliseconds + DURATION_DECODE_MARGIN_MILLISECONDS) / SECONDS_TO_MILLISECONDS
    const outcome = await runCommand({
      args: [
        '-nostdin',
        '-v',
        'error',
        '-progress',
        'pipe:1',
        '-i',
        filePath,
        '-t',
        String(cap),
        '-f',
        'null',
        '-',
      ],
      command: ffmpegPath,
      timeoutMilliseconds: decodeTimeout,
    })
    const durationMilliseconds = parseDecodedDuration(readStdout(outcome))
    if (durationMilliseconds === undefined) throw failWith('engine_failed')
    return durationMilliseconds
  }

  async function measure(params: AudioDurationProbeParams): Promise<number> {
    const workDirectory = await mkdtemp(join(tmpdir(), 'audio-duration-'))
    try {
      const filePath = join(workDirectory, 'source.bin')
      await writeFile(filePath, params.audio)
      const headerDuration = await readHeaderDuration(filePath)
      return headerDuration ?? (await decodeDuration(filePath, params.maxDurationMilliseconds))
    } finally {
      await rm(workDirectory, { force: true, recursive: true })
    }
  }

  return { measure }
}
