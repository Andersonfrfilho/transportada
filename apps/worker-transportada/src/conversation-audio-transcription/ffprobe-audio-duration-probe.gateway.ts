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
  SAFE_PROTOCOL_WHITELIST_ARGUMENTS,
  SPEECH_TO_TEXT_FAILURE_KIND,
} from './audio-transcription-engine.constant.js'
import type { AudioDurationProbe, AudioDurationProbeParams } from './audio-duration-probe.port.js'
import {
  runCommandWithTimeout,
  type CommandOutcome,
  type RunCommand,
} from './run-command-with-timeout.js'
import { SpeechToTextError, type SpeechToTextFailure } from './speech-to-text.error.js'

export type FfprobeAudioDurationProbeOptions = {
  readonly ffprobePath?: string
  readonly ffmpegPath?: string
  readonly probeTimeoutMilliseconds?: number
  readonly decodeTimeoutMilliseconds?: number
  readonly runCommand?: RunCommand
}

type ProbeContext = {
  readonly ffprobePath: string
  readonly ffmpegPath: string
  readonly probeTimeout: number
  readonly decodeTimeout: number
  readonly runCommand: RunCommand
}

type MeasureStepParams = {
  readonly filePath: string
  readonly signal: AbortSignal | undefined
}

type DecodeStepParams = MeasureStepParams & { readonly maxDurationMilliseconds: number }

const MICROSECONDS_PER_MILLISECOND = 1_000
const SECONDS_TO_MILLISECONDS = 1_000
const DECODED_TIME_PATTERN = /^out_time_us=(\d+)$/gmu

const TIMEOUT_FAILURE: SpeechToTextFailure = {
  code: 'engine_timeout',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
}
/** Processo que não sobe é do ambiente (binário ausente), não do áudio: não gasta tentativa. */
const SPAWN_FAILURE: SpeechToTextFailure = {
  code: 'engine_failed',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.INFRASTRUCTURE,
}
const ABORT_FAILURE: SpeechToTextFailure = {
  code: 'engine_failed',
  kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
}

function failWith(code: 'engine_failed' | 'unsupported_format'): SpeechToTextError {
  return new SpeechToTextError({ code, kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE })
}

/** Prazo estourado é retriável; arquivo que o `ffprobe` recusa não melhora tentando de novo. */
function readStdout(outcome: CommandOutcome): string {
  if (outcome.outcome === 'timed_out') throw new SpeechToTextError(TIMEOUT_FAILURE)
  if (outcome.outcome === 'aborted') throw new SpeechToTextError(ABORT_FAILURE)
  if (outcome.outcome === 'spawn_failed') throw new SpeechToTextError(SPAWN_FAILURE)
  if (outcome.exitCode !== 0) throw failWith('unsupported_format')
  return outcome.stdout
}

function parseHeaderDuration(stdout: string): number | undefined {
  const seconds = Number(stdout.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return Math.round(seconds * SECONDS_TO_MILLISECONDS)
}

function parseDecodedDuration(stdout: string): number | undefined {
  const lastMatch = [...stdout.matchAll(DECODED_TIME_PATTERN)].at(-1)
  if (lastMatch?.[1] === undefined) return undefined
  return Math.round(Number(lastMatch[1]) / MICROSECONDS_PER_MILLISECOND)
}

async function readHeaderDuration(
  context: ProbeContext,
  step: MeasureStepParams,
): Promise<number | undefined> {
  const outcome = await context.runCommand({
    args: [
      '-v',
      'error',
      ...SAFE_PROTOCOL_WHITELIST_ARGUMENTS,
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      step.filePath,
    ],
    command: context.ffprobePath,
    ...(step.signal === undefined ? {} : { signal: step.signal }),
    timeoutMilliseconds: context.probeTimeout,
  })
  return parseHeaderDuration(readStdout(outcome))
}

async function decodeDuration(context: ProbeContext, step: DecodeStepParams): Promise<number> {
  const cap =
    (step.maxDurationMilliseconds + DURATION_DECODE_MARGIN_MILLISECONDS) / SECONDS_TO_MILLISECONDS
  const outcome = await context.runCommand({
    args: [
      '-nostdin',
      '-v',
      'error',
      ...SAFE_PROTOCOL_WHITELIST_ARGUMENTS,
      '-progress',
      'pipe:1',
      '-i',
      step.filePath,
      '-t',
      String(cap),
      '-f',
      'null',
      '-',
    ],
    command: context.ffmpegPath,
    ...(step.signal === undefined ? {} : { signal: step.signal }),
    timeoutMilliseconds: context.decodeTimeout,
  })
  const durationMilliseconds = parseDecodedDuration(readStdout(outcome))
  if (durationMilliseconds === undefined) throw failWith('engine_failed')
  return durationMilliseconds
}

async function measureAudio(
  context: ProbeContext,
  params: AudioDurationProbeParams,
): Promise<number> {
  const workDirectory = await mkdtemp(join(tmpdir(), 'audio-duration-'))
  try {
    const step = { filePath: join(workDirectory, 'source.bin'), signal: params.signal }
    await writeFile(step.filePath, params.audio)
    const headerDuration = await readHeaderDuration(context, step)
    return (
      headerDuration ??
      (await decodeDuration(context, {
        ...step,
        maxDurationMilliseconds: params.maxDurationMilliseconds,
      }))
    )
  } finally {
    await rm(workDirectory, { force: true, recursive: true })
  }
}

export function createFfprobeAudioDurationProbe(
  options: FfprobeAudioDurationProbeOptions = {},
): AudioDurationProbe {
  const context: ProbeContext = {
    decodeTimeout: options.decodeTimeoutMilliseconds ?? DURATION_DECODE_TIMEOUT_MILLISECONDS,
    ffmpegPath: options.ffmpegPath ?? DEFAULT_FFMPEG_BINARY,
    ffprobePath: options.ffprobePath ?? DEFAULT_FFPROBE_BINARY,
    probeTimeout: options.probeTimeoutMilliseconds ?? FFPROBE_TIMEOUT_MILLISECONDS,
    runCommand: options.runCommand ?? runCommandWithTimeout,
  }
  return { measure: (params) => measureAudio(context, params) }
}
