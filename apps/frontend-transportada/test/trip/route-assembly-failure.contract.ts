/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  ROUTE_ASSEMBLY_TIMEOUT_CODE,
  resolveRouteAssemblyFailure,
} from '@/modules/trip/shared/routeAssemblyFailure.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PANEL_PATH = 'src/modules/trip/components/TripRouteAssemblyPanel.component.tsx'
const HOOK_PATH = 'src/modules/trip/hooks/useTripRouteAssembly.hook.ts'
const TRIP_LOCALE_PATH = 'src/modules/trip/locales/trip.locale.json'
const TRIP_ENGLISH_LOCALE_PATH = 'src/modules/trip/locales/trip.en.locale.json'
const ROUTING_LOCALE_PATH = 'src/modules/routing/locales/routing.locale.json'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
}

/** Segue o caminho `a.b.c` num JSON de tradução, devolvendo `undefined` se algum degrau faltar. */
function readKey(source: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, step) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[step]
          : undefined,
      source,
    )
}

describe('trip route assembly failure contract', () => {
  /**
   * ⚠️ Medido em 2026-09-03: o painel dizia "Confira as notas e a frota escolhidas" enquanto a
   * causa era o worker fora do ar. As notas e a frota estavam certas, e a frase mandava revisá-las.
   */
  test('a frase genérica que acusava as notas e a frota não existe mais', async () => {
    const [panel, locale, english] = await Promise.all([
      readApplicationFile(PANEL_PATH),
      readApplicationFile(TRIP_LOCALE_PATH),
      readApplicationFile(TRIP_ENGLISH_LOCALE_PATH),
    ])

    expect(panel).not.toContain("t('routeAssembly.failed')")
    expect(locale).not.toContain('Confira as notas e a frota escolhidas')
    expect(english).not.toContain('Check the invoices and the fleet you picked')
  })

  test('as recusas do roteirizador saem do módulo dele, sem cópia de texto', async () => {
    const routing = await readJson(ROUTING_LOCALE_PATH)

    for (const code of [
      'ROUTE_SUGGESTION_DOCUMENT_UNAVAILABLE',
      'ROUTE_SUGGESTION_DRIVER_REPEATED',
      'ROUTE_SUGGESTION_DRIVER_UNAVAILABLE',
      'ROUTE_SUGGESTION_POOL_EMPTY',
      'ROUTE_SUGGESTION_VEHICLE_UNAVAILABLE',
    ]) {
      const failure = resolveRouteAssemblyFailure(new Error(code))

      expect(failure.namespace).toBe('routing')
      expect(failure).toHaveProperty('key')
      /** A chave tem de existir de verdade no `routing`, senão a tela imprime o caminho cru. */
      if ('key' in failure) expect(readKey(routing, failure.key)).toBeTypeOf('string')
    }
  })

  /** A matriz de estrada fora do ar já tem texto próprio, e ele manda ordenar as paradas à mão. */
  test('a queda da matriz de estrada reusa o texto do roteirizador', async () => {
    const routing = await readJson(ROUTING_LOCALE_PATH)
    const failure = resolveRouteAssemblyFailure(new Error('ROUTING_MATRIX_UNAVAILABLE'))

    expect(failure.namespace).toBe('routing')
    if ('key' in failure) expect(readKey(routing, failure.key)).toBeTypeOf('string')
  })

  /**
   * Timeout é infraestrutura, não dado: ninguém consumiu o pedido. O texto não pode mandar tentar
   * de novo — repetir cria outra sugestão e deixa a anterior enfileirada.
   */
  test('o teto de espera tem texto próprio, nos dois idiomas', async () => {
    const [locale, english] = await Promise.all([
      readJson(TRIP_LOCALE_PATH),
      readJson(TRIP_ENGLISH_LOCALE_PATH),
    ])
    const failure = resolveRouteAssemblyFailure(new Error(ROUTE_ASSEMBLY_TIMEOUT_CODE))

    expect(failure.namespace).toBe('trip')
    if ('key' in failure) {
      expect(readKey(locale, failure.key)).toBeTypeOf('string')
      expect(readKey(english, failure.key)).toBeTypeOf('string')
      expect(String(readKey(locale, failure.key))).toContain('continua na fila')
    }
  })

  test('a proposta que envelheceu e a queda de rede também são nomeadas', async () => {
    const locale = await readJson(TRIP_LOCALE_PATH)

    for (const code of ['ROUTE_SUGGESTION_STALE', 'TRIP_REQUEST_FAILED']) {
      const failure = resolveRouteAssemblyFailure(new Error(code))

      expect(failure.namespace).toBe('trip')
      if ('key' in failure) expect(readKey(locale, failure.key)).toBeTypeOf('string')
    }
  })

  /**
   * ⚠️ Código desconhecido **não some**: a frase genérica sai com ele ao lado, e é ele que permite
   * pedir suporte com informação. Engolir o desconhecido devolveria o defeito que isto conserta.
   */
  test('código desconhecido chega ao operador, com o código junto', async () => {
    const locale = await readJson(TRIP_LOCALE_PATH)
    const failure = resolveRouteAssemblyFailure(new Error('ALGO_QUE_NINGUEM_MAPEOU'))

    expect(failure.namespace).toBe('unknown')
    expect(failure.code).toBe('ALGO_QUE_NINGUEM_MAPEOU')
    expect(String(readKey(locale, 'routeAssembly.failure.unknown'))).toContain('{{code}}')
  })

  /** Erro sem mensagem ainda é falha: sem nome ele viraria uma tela sem aviso nenhum. */
  test('erro sem mensagem continua sendo falha nomeada', () => {
    expect(resolveRouteAssemblyFailure(new Error('')).code).toBe('UNKNOWN')
    expect(resolveRouteAssemblyFailure(undefined).code).toBe('UNKNOWN')
  })

  /** Duas grafias do mesmo código divergiriam calado: quem lança é quem o serviço mapeia. */
  test('o código do teto de espera é a mesma constante que a espera lança', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('throw new Error(ROUTE_ASSEMBLY_TIMEOUT_CODE)')
    expect(hook).not.toContain("throw new Error('ROUTE_SUGGESTION_TIMEOUT')")
  })

  /**
   * O esqueleto tem a forma do que ele antecede — um cartão por veículo escolhido. Texto solto e
   * `null` são o que faz a tela saltar quando o roteiro chega (`docs/frontend/loading.md`).
   */
  test('a espera desenha esqueleto com a forma do resultado, não texto solto', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain('<SkeletonGroup className={styles.assemblyPending}')
    expect(panel).toContain("label={t('routeAssembly.pending')}")
    expect(panel).toContain('assembly.effectiveVehicleIds.map')
    expect(panel).not.toContain("<p className={styles.hint}>{t('routeAssembly.pending')}</p>")
  })
})
