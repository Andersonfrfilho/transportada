/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CachePort } from '@adatechnology/notification-contracts'

type CreateInMemoryNotificationCacheParams = {
  readonly now?: () => Date
}

type CacheEntry = {
  readonly expiresAt: number
  readonly value: string
}

/**
 * Cache de processo, não distribuído. É o que sustenta o nonce do webhook (e o teto por hora do
 * módulo), e a escolha vem da distribuição: uma instalação por transportadora, um processo de API
 * (ADR-0021). A janela de assinatura é de 5 minutos, então o pior caso de reinício é aceitar de
 * novo um recibo dos últimos 5 minutos — e recibo é idempotente no módulo.
 *
 * ⚠️ Com mais de uma réplica a proteção passa a valer por réplica. Nesse dia isto vira adaptador
 * sobre armazenamento compartilhado; é a mesma ressalva que o módulo faz para o notificador em
 * processo.
 */
export function createInMemoryNotificationCache({
  now = () => new Date(),
}: CreateInMemoryNotificationCacheParams = {}): CachePort {
  const entries = new Map<string, CacheEntry>()

  function read(key: string): string | undefined {
    const entry = entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= now().getTime()) {
      entries.delete(key)
      return undefined
    }
    return entry.value
  }

  return Object.freeze({
    async delete(key: string) {
      entries.delete(key)
    },
    async get(key: string) {
      return read(key)
    },
    async increment({ key, ttlSeconds }: { readonly key: string; readonly ttlSeconds: number }) {
      const current = read(key)
      const next = current === undefined ? 1 : Number(current) + 1
      // A expiração é a da primeira reivindicação: renová-la a cada tentativa deixaria um atacante
      // manter a chave viva para sempre repetindo o replay.
      const expiresAt =
        current === undefined
          ? now().getTime() + ttlSeconds * 1000
          : (entries.get(key)?.expiresAt ?? now().getTime() + ttlSeconds * 1000)
      entries.set(key, { expiresAt, value: String(next) })
      return next
    },
    async set({
      key,
      ttlSeconds,
      value,
    }: {
      readonly key: string
      readonly ttlSeconds: number
      readonly value: string
    }) {
      entries.set(key, { expiresAt: now().getTime() + ttlSeconds * 1000, value })
    },
  })
}
