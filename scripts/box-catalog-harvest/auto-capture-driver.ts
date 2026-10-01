#!/usr/bin/env bun
/**
 * Auto-captura dirigida pelo Chrome real (aba do Cosmos): consulta a fila no servidor
 * local e navega uma página por vez, com jitter de 2–5s, até a fila zerar.
 *
 * Separação de responsabilidades:
 *   - driver  → só navega (AppleScript/Chrome). Nunca escreve JSONL.
 *   - servidor (assisted-capture-server.ts) → recebe a leitura do userscript e grava o JSONL.
 *   - banco   → nunca é tocado. A importação é a spec 162, depois, com aprovação.
 *
 * Paradas de segurança: se o head da fila não avançar em HEAD_TIMEOUT_MS por
 * MAX_STALLS vezes seguidas (ex.: desafio "Just a moment", página sem resposta),
 * o driver PARA e reporta — nada de contornar desafio (RF04 da spec 161).
 */
import { spawnSync } from 'node:child_process'

const SERVER = process.env.CAPTURE_SERVER ?? 'http://127.0.0.1:53999'
const CLIENT_HEADER = { 'x-capture-client': 'transportada-userscript' }
const COSMOS_PREFIX = 'https://cosmos.bluesoft.com.br'
const LOG_PATH = `${process.env.HOME}/Library/Application Support/transportada/capture-driver.log`
const MIN_MS = Number(process.env.CAPTURE_MIN_MS ?? 12_000)
const MAX_MS = Number(process.env.CAPTURE_MAX_MS ?? 18_000)
const HEAD_TIMEOUT_MS = Number(process.env.CAPTURE_HEAD_TIMEOUT_MS ?? 90_000)
const MAX_STALLS = Number(process.env.CAPTURE_MAX_STALLS ?? 3)
const BURST_MAX = Number(process.env.CAPTURE_BURST_MAX ?? 20)
const BURST_PAUSE_MS = Number(process.env.CAPTURE_BURST_PAUSE_MS ?? 300_000)
const MAX_PAGES = Number(process.env.CAPTURE_MAX_PAGES ?? 0)

const logLines: string[] = []

function log(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry })
  logLines.push(line)
  console.log(line)
  void Bun.write(LOG_PATH, `${logLines.join('\n')}\n`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitter(): number {
  return MIN_MS + Math.random() * (MAX_MS - MIN_MS)
}

interface NextState {
  done?: boolean
  url?: string
  remaining?: number
  blocked?: { reason?: string; url?: string }
}

async function fetchNext(): Promise<NextState> {
  const res = await fetch(`${SERVER}/next`, { headers: CLIENT_HEADER })
  if (!res.ok) throw new Error(`servidor local respondeu ${res.status}`)
  return (await res.json()) as NextState
}

/** Navega a aba do Cosmos existente no Chrome; se não houver, abre em aba nova. */
function navigateChromeTo(url: string): boolean {
  const escaped = url.replace(/"/g, '\\"')
  const script = `tell application "Google Chrome"
    if (count of windows) is 0 then
      make new window with properties {URL:"${escaped}"}
      return
    end if
    set found to false
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with "${COSMOS_PREFIX}" then
          set URL of t to "${escaped}"
          set found to true
        end if
      end repeat
    end repeat
    if not found then
      tell front window to make new tab with properties {URL:"${escaped}"}
    end if
  end tell`
  const result = spawnSync('osascript', ['-e', script], { encoding: 'utf8' })
  if (result.status !== 0)
    log({ level: 'warn', event: 'navigate_failed', stderr: result.stderr?.trim() })
  return result.status === 0
}

async function main(): Promise<number> {
  const startedAt = Date.now()
  let lastHead = ''
  let lastHeadAt = Date.now()
  let stalls = 0
  let opened = 0
  let openedInBurst = 0

  log({
    level: 'info',
    event: 'start',
    minMs: MIN_MS,
    maxMs: MAX_MS,
    burstMax: BURST_MAX,
    burstPauseMs: BURST_PAUSE_MS,
    maxPages: MAX_PAGES,
    headTimeoutMs: HEAD_TIMEOUT_MS,
  })

  while (true) {
    let state: NextState
    try {
      state = await fetchNext()
    } catch (error) {
      log({ level: 'fatal', event: 'server_unreachable', message: (error as Error).message })
      return 1
    }

    if (state.blocked) {
      log({
        level: 'fatal',
        event: 'blocked',
        reason: state.blocked.reason,
        url: state.blocked.url,
        remaining: state.remaining,
        hint: 'Cloudflare 1015 detectado pelo userscript — parei sem contornar',
      })
      return 3
    }

    if (state.done) {
      log({ level: 'info', event: 'done', opened, elapsedMs: Date.now() - startedAt })
      return 0
    }

    // Fila vazia de página mas sem done: estado transitório, espera e tenta de novo.
    if (!state.url) {
      await sleep(2000)
      continue
    }

    if (state.url === lastHead) {
      // Head não avançou: a captura da página atual ainda não foi gravada.
      if (Date.now() - lastHeadAt > HEAD_TIMEOUT_MS) {
        stalls += 1
        if (stalls >= MAX_STALLS) {
          log({
            level: 'fatal',
            event: 'stall_timeout',
            url: state.url,
            remaining: state.remaining,
            stalls,
            hint: 'possível desafio do Cloudflare ou página sem resposta — parei, sem contornar',
          })
          return 2
        }
        log({
          level: 'warn',
          event: 'stall',
          url: state.url,
          remaining: state.remaining,
          stalls,
        })
        await sleep(30_000)
      } else {
        await sleep(1000)
      }
      continue
    }

    // Novo head: navega e cronometra o avanço.
    if (MAX_PAGES > 0 && opened >= MAX_PAGES) {
      log({
        level: 'info',
        event: 'done',
        opened,
        elapsedMs: Date.now() - startedAt,
        limit: MAX_PAGES,
      })
      return 0
    }
    if (openedInBurst >= BURST_MAX) {
      log({ level: 'info', event: 'burst_pause', openedInBurst, pauseMs: BURST_PAUSE_MS })
      await sleep(BURST_PAUSE_MS)
      openedInBurst = 0
    }
    const ok = navigateChromeTo(state.url)
    opened += 1
    openedInBurst += 1
    lastHead = state.url
    lastHeadAt = Date.now()
    stalls = 0
    log({
      level: 'info',
      event: 'opened',
      url: state.url,
      remaining: state.remaining,
      opened,
      openedInBurst,
      navigated: ok,
    })
    await sleep(jitter())
  }
}

process.exit(await main())
