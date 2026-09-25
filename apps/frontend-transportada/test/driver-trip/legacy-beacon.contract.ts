/* Copyright (c) 2026 Ada Technology. MIT License. */
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import {
  DRIVER_LEGACY_BEACON_MODE,
  DRIVER_LEGACY_BEACON_PATH,
  sendDriverLegacyBeacon,
} from '@/modules/driver-trip/shared/driverAppRedirect.service'

const APPLICATION_ROOT = new URL('../../', import.meta.url).pathname
const SOURCE_ROOT = join(APPLICATION_ROOT, 'src')
const SERVER_SOURCE = join(APPLICATION_ROOT, 'server.ts')
const BEACON_CALL = 'sendDriverLegacyBeacon('
const SERVER_BOOT_TIMEOUT_MS = 10_000

async function listSourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return listSourceFiles(path)
      return Promise.resolve(/\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [])
    }),
  )
  return nested.flat()
}

/**
 * ADR-0075 §6: a remoção do módulo antigo é **medida**, não marcada no calendário — zero beacons em
 * 14 dias seguidos nos logs de produção. Por isso o beacon sai **só** da tela de pendências: uma
 * conta de escritório abrindo `/minha-viagem` seria ruído, e a medida deixaria de dizer "ninguém
 * mais usa".
 */
describe('o beacon de uso legado sai só da tela de pendências', () => {
  it('manda o valor enumerado para a própria origem', () => {
    const calls: [string, string][] = []

    sendDriverLegacyBeacon({
      sendBeacon: (url, data) => {
        calls.push([url, data])
        return true
      },
    })

    expect(calls).toEqual([['/_driver-legacy-served', 'pending-screen']])
    expect(DRIVER_LEGACY_BEACON_PATH).toBe('/_driver-legacy-served')
    expect(DRIVER_LEGACY_BEACON_MODE).toBe('pending-screen')
  })

  it('sendBeacon só existe no serviço do beacon', async () => {
    const offenders: string[] = []
    for (const file of await listSourceFiles(SOURCE_ROOT)) {
      const text = await readFile(file, 'utf8')
      if (text.includes('sendBeacon') && !file.endsWith('driverAppRedirect.service.ts')) {
        offenders.push(file.replace(APPLICATION_ROOT, ''))
      }
    }

    expect(offenders).toEqual([])
  })

  it('o boot chama o beacon uma vez, e só no ramo pending-screen', async () => {
    const main = await readFile(join(SOURCE_ROOT, 'main.tsx'), 'utf8')
    const callIndex = main.indexOf(BEACON_CALL)
    const branchStart = main.indexOf("case 'pending-screen':")
    const nextBranch = main.slice(branchStart + 1).search(/case '|default:/u)
    const branchEnd = nextBranch === -1 ? main.length : branchStart + 1 + nextBranch

    expect(main.split(BEACON_CALL).length - 1).toBe(1)
    expect(branchStart).toBeGreaterThan(-1)
    expect(callIndex).toBeGreaterThan(branchStart)
    expect(callIndex).toBeLessThan(branchEnd)
  })
})

/**
 * A rota do `server.ts` do painel é **pública**: ninguém autentica um `sendBeacon`. O que a mantém
 * inofensiva é aceitar só o valor enumerado, ler no máximo ~32 bytes e responder `204` sempre — sem
 * distinguir válido de inválido para quem pergunta, e sem log para o que não é o valor esperado.
 *
 * O teste sobe o `server.ts` de verdade, num diretório temporário com um `dist/` mínimo: importar o
 * arquivo subiria um `Bun.serve` sem controle, e o que se quer provar é o processo, com o log dele.
 */
describe('a rota /_driver-legacy-served do server.ts', () => {
  let workingDirectory = ''
  let serverProcess: ReturnType<typeof Bun.spawn> | undefined
  let baseUrl = ''

  beforeAll(async () => {
    workingDirectory = await mkdtemp(join(tmpdir(), 'driver-legacy-beacon-'))
    await mkdir(join(workingDirectory, 'dist'))
    await copyFile(SERVER_SOURCE, join(workingDirectory, 'server.ts'))
    await writeFile(
      join(workingDirectory, 'dist', 'content-security-policy.txt'),
      "default-src 'self'",
    )
    await writeFile(join(workingDirectory, 'dist', 'index.html'), '<!doctype html><title>t</title>')

    const probe = Bun.serve({ fetch: () => new Response(null), port: 0 })
    const port = probe.port
    await probe.stop(true)
    baseUrl = `http://127.0.0.1:${port}`

    serverProcess = Bun.spawn(['bun', './server.ts'], {
      cwd: workingDirectory,
      env: { ...process.env, PORT: String(port) },
      stderr: 'pipe',
      stdout: 'pipe',
    })

    const deadline = Date.now() + SERVER_BOOT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const isReady = await fetch(`${baseUrl}/health/live`).then(
        (response) => response.ok,
        () => false,
      )
      if (isReady) return
      await Bun.sleep(50)
    }
    throw new Error('DRIVER_LEGACY_BEACON_SERVER_DID_NOT_START')
  })

  afterAll(async () => {
    serverProcess?.kill()
    await serverProcess?.exited
    await rm(workingDirectory, { force: true, recursive: true })
  })

  /** Encerra o processo e devolve as linhas de log que ele escreveu até ali. */
  async function readLogLines(): Promise<readonly string[]> {
    serverProcess?.kill()
    await serverProcess?.exited
    const stdout = serverProcess?.stdout
    const text = stdout instanceof ReadableStream ? await new Response(stdout).text() : ''
    return text.split('\n').filter((line) => line.trim() !== '')
  }

  function post(body: BodyInit, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${baseUrl}/_driver-legacy-served`, {
      body,
      headers: { 'content-type': 'text/plain;charset=UTF-8', ...headers },
      method: 'POST',
    })
  }

  it('responde 204 a tudo: válido, inválido, grande, em partes e outro método', async () => {
    const responses = await Promise.all([
      post('pending-screen'),
      post('install-screen'),
      post(`pending-screen${'x'.repeat(200)}`),
      post(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('pending-'))
            controller.enqueue(new TextEncoder().encode(`screen${'y'.repeat(64)}`))
            controller.close()
          },
        }),
      ),
      fetch(`${baseUrl}/_driver-legacy-served`),
    ])

    expect(responses.map((response) => response.status)).toEqual([204, 204, 204, 204, 204])
    for (const response of responses) {
      expect(await response.text()).toBe('')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    }
  })

  /**
   * Valor válido gera **uma** linha, sem usuário e sem IP. Os outros quatro pedidos do teste
   * anterior não geram nada: log de valor arbitrário seria um jeito de escrever no log de produção
   * por uma rota sem autenticação.
   */
  it('só o valor enumerado gera log, e a linha não carrega quem mandou', async () => {
    const lines = await readLogLines()
    const beaconLines = lines.filter((line) => line.includes('driver_legacy_served'))

    expect(beaconLines).toHaveLength(1)
    const entry = JSON.parse(beaconLines[0] ?? '{}') as Record<string, unknown>
    expect(Object.keys(entry).sort()).toEqual(['at', 'event', 'mode'])
    expect(entry.event).toBe('driver_legacy_served')
    expect(entry.mode).toBe('pending-screen')
    expect(Number.isNaN(Date.parse(String(entry.at)))).toBe(false)
    expect(lines.join('\n')).not.toContain('install-screen')
    expect(lines.join('\n')).not.toContain('xxxx')
  })
})
