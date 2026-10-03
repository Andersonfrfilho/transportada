/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0094 §2: o padrão que lê o `NroCarga` do `infCpl` é dado do perfil e vai rodar sobre texto de
 * NF-e de terceiro. Aqui ele só é compilado e lido como texto — nunca executado contra entrada. É a
 * primeira barreira contra retrocesso catastrófico; a fase que executar limita entrada e tempo.
 */

export const ARRIVAL_REFERENCE_PATTERN_ISSUES = [
  'invalid_syntax',
  'capture_group_count',
  'backreference',
  'lookaround',
  'nested_quantifier',
  'quantified_alternation',
] as const
export type ArrivalReferencePatternIssue = (typeof ARRIVAL_REFERENCE_PATTERN_ISSUES)[number]

export const ARRIVAL_REFERENCE_PATTERN_ISSUE_MESSAGES: Readonly<
  Record<ArrivalReferencePatternIssue, string>
> = {
  backreference: 'Backreferences are not allowed',
  capture_group_count: 'The pattern must have exactly one capture group',
  invalid_syntax: 'The pattern is not a valid regular expression',
  lookaround: 'Lookahead and lookbehind are not allowed',
  nested_quantifier: 'A repeated group must not contain another quantifier',
  quantified_alternation: 'A repeated group must not contain alternation',
}

const REQUIRED_CAPTURE_GROUPS = 1
const LOOKAROUND_PREFIXES = ['(?=', '(?!', '(?<=', '(?<!'] as const
/** `?` é opcional, não repetição: `(a+)?` não retrocede além do que `a+` já retrocederia. */
const REPEATING_QUANTIFIERS = new Set(['*', '+', '{'])
const QUANTIFIERS = new Set(['*', '+', '?', '{'])
const BRACED_ESCAPES = new Set(['p', 'P', 'u'])

type GroupFrame = { hasAlternation: boolean; hasQuantifier: boolean }
type ScanState = { captureGroups: number; readonly frames: GroupFrame[] }
type ScanStep = { readonly issue?: ArrivalReferencePatternIssue; readonly nextIndex: number }

export function findArrivalReferencePatternIssue(
  pattern: string,
): ArrivalReferencePatternIssue | undefined {
  if (!compiles(pattern)) return 'invalid_syntax'

  const state: ScanState = {
    captureGroups: 0,
    frames: [{ hasAlternation: false, hasQuantifier: false }],
  }
  let index = 0
  while (index < pattern.length) {
    const step = scanToken({ index, pattern, state })
    if (step.issue !== undefined) return step.issue
    index = step.nextIndex
  }

  return state.captureGroups === REQUIRED_CAPTURE_GROUPS ? undefined : 'capture_group_count'
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern, 'u')
    return true
  } catch {
    return false
  }
}

function scanToken(input: {
  readonly index: number
  readonly pattern: string
  readonly state: ScanState
}): ScanStep {
  const { index, pattern, state } = input
  const character = pattern[index] ?? ''
  const frame = currentFrame(state)

  if (character === '\\') return scanEscape(pattern, index)
  if (character === '[') return { nextIndex: findClassEnd(pattern, index) + 1 }
  if (character === '(') return openGroup({ index, pattern, state })
  if (character === ')') return closeGroup({ index, pattern, state })
  if (character === '|') frame.hasAlternation = true
  if (QUANTIFIERS.has(character)) frame.hasQuantifier = true
  if (character === '{') return { nextIndex: pattern.indexOf('}', index) + 1 }
  return { nextIndex: index + 1 }
}

function scanEscape(pattern: string, index: number): ScanStep {
  const escaped = pattern[index + 1] ?? ''
  if (/[1-9]/u.test(escaped) || escaped === 'k') return { issue: 'backreference', nextIndex: index }
  if (BRACED_ESCAPES.has(escaped) && pattern[index + 2] === '{') {
    return { nextIndex: pattern.indexOf('}', index) + 1 }
  }
  return { nextIndex: index + 2 }
}

function findClassEnd(pattern: string, start: number): number {
  let index = start + 1
  while (index < pattern.length && pattern[index] !== ']') {
    index += pattern[index] === '\\' ? 2 : 1
  }
  return index
}

function openGroup(input: {
  readonly index: number
  readonly pattern: string
  readonly state: ScanState
}): ScanStep {
  const { index, pattern, state } = input
  if (LOOKAROUND_PREFIXES.some((prefix) => pattern.startsWith(prefix, index))) {
    return { issue: 'lookaround', nextIndex: index }
  }
  state.frames.push({ hasAlternation: false, hasQuantifier: false })
  if (pattern[index + 1] !== '?') {
    state.captureGroups += 1
    return { nextIndex: index + 1 }
  }
  if (pattern.startsWith('(?<', index)) {
    state.captureGroups += 1
    return { nextIndex: pattern.indexOf('>', index) + 1 }
  }
  return { nextIndex: pattern.indexOf(':', index) + 1 }
}

function closeGroup(input: {
  readonly index: number
  readonly pattern: string
  readonly state: ScanState
}): ScanStep {
  const { index, pattern, state } = input
  const closed = state.frames.pop() ?? { hasAlternation: false, hasQuantifier: false }
  const quantifier = pattern[index + 1] ?? ''
  const isRepeated = REPEATING_QUANTIFIERS.has(quantifier)

  if (isRepeated && closed.hasQuantifier) return { issue: 'nested_quantifier', nextIndex: index }
  if (isRepeated && closed.hasAlternation) {
    return { issue: 'quantified_alternation', nextIndex: index }
  }
  const parent = currentFrame(state)
  parent.hasQuantifier ||= closed.hasQuantifier
  parent.hasAlternation ||= closed.hasAlternation
  return { nextIndex: index + 1 }
}

function currentFrame(state: ScanState): GroupFrame {
  const frame = state.frames.at(-1)
  if (frame === undefined) throw new Error('ARRIVAL_REFERENCE_PATTERN_SCAN_WITHOUT_ROOT_FRAME')
  return frame
}
