/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T3: **quem é quem num grupo.** O webhook do grupo diz quem escreveu e quem foi marcado, mas
 * o WhatsApp passou a esconder o número atrás do `@lid` (identificador oculto). Aqui fica a tradução
 * `@lid` → número, lida da lista de participantes do grupo no Evolution, e o número do próprio bot.
 *
 * As duas leituras vão à rede, então ficam em memória por um tempo curto (por processo; cada réplica
 * da API tem o seu cache). Um `@lid` que não está na lista em cache força uma releitura, no máximo uma
 * vez a cada `refreshAfterMs` por grupo: membro novo entra sem esperar o cache vencer, e mensagem em
 * rajada de alguém sem tradução não vira rajada de chamadas ao Evolution.
 *
 * ⚠️ Nada de número em log: só empresa e motivo.
 */
import type { EvolutionConnectionRequest } from './whatsapp-evolution.port.js'

/** Um participante como o Evolution o devolve: o `@lid` e o número (só dígitos), quando conhecidos. */
export type EvolutionGroupParticipant = {
  readonly lid: null | string
  readonly number: null | string
}

export type EvolutionGroupDirectoryGatewayPort = {
  /** O número do chip conectado, só dígitos; `null` quando o Evolution não informa. */
  getOwnerNumber(input: EvolutionConnectionRequest): Promise<null | string>
  /** `GET /group/participants/{instância}?groupJid=…`; falha de rede ou status ≥ 300 lança. */
  listGroupParticipants(
    input: EvolutionConnectionRequest & { readonly groupJid: string },
  ): Promise<readonly EvolutionGroupParticipant[]>
}

export type LazyEvolutionConnection = () => Promise<EvolutionConnectionRequest>

export type EvolutionGroupIdentity = {
  /** O número do bot, só dígitos; `null` quando o Evolution não informa. */
  botNumber(input: {
    readonly companyId: string
    readonly connection: LazyEvolutionConnection
  }): Promise<null | string>
  /**
   * `@lid` (dígitos) → número (dígitos) do grupo. Se algum de `lids` não estiver no cache, relê a
   * lista (respeitando `refreshAfterMs`).
   */
  lidDirectory(input: {
    readonly companyId: string
    readonly connection: LazyEvolutionConnection
    readonly groupJid: string
    readonly lids: readonly string[]
  }): Promise<ReadonlyMap<string, string>>
}

type Cached<T> = { readonly at: number; readonly value: T }

export const EVOLUTION_GROUP_IDENTITY_DEFAULTS = {
  ownerTtlMs: 10 * 60_000,
  participantsTtlMs: 5 * 60_000,
  refreshAfterMs: 30_000,
} as const

export function createEvolutionGroupIdentity(dependencies: {
  readonly clock?: () => number
  readonly gateway: EvolutionGroupDirectoryGatewayPort
  readonly ownerTtlMs?: number
  readonly participantsTtlMs?: number
  readonly refreshAfterMs?: number
}): EvolutionGroupIdentity {
  const now = dependencies.clock ?? Date.now
  const ownerTtl = dependencies.ownerTtlMs ?? EVOLUTION_GROUP_IDENTITY_DEFAULTS.ownerTtlMs
  const participantsTtl =
    dependencies.participantsTtlMs ?? EVOLUTION_GROUP_IDENTITY_DEFAULTS.participantsTtlMs
  const refreshAfter =
    dependencies.refreshAfterMs ?? EVOLUTION_GROUP_IDENTITY_DEFAULTS.refreshAfterMs
  const owners = new Map<string, Cached<null | string>>()
  const directories = new Map<string, Cached<ReadonlyMap<string, string>>>()

  return {
    async botNumber({ companyId, connection }) {
      const cached = owners.get(companyId)
      if (cached !== undefined && now() - cached.at < ownerTtl) return cached.value
      const value = await dependencies.gateway.getOwnerNumber(await connection())
      // `null` não fica em cache: o chip pode estar pareando, e a próxima mensagem tenta de novo.
      if (value !== null) owners.set(companyId, { at: now(), value })
      return value
    },

    async lidDirectory({ companyId, connection, groupJid, lids }) {
      const key = `${companyId}\u0000${groupJid}`
      const cached = directories.get(key)
      const age = cached === undefined ? Number.POSITIVE_INFINITY : now() - cached.at
      const missing = cached === undefined || lids.some((lid) => !cached.value.has(lid))
      if (cached !== undefined && age < participantsTtl && (!missing || age < refreshAfter)) {
        return cached.value
      }
      const participants = await dependencies.gateway.listGroupParticipants({
        ...(await connection()),
        groupJid,
      })
      const value = new Map<string, string>()
      for (const participant of participants) {
        if (participant.lid !== null && participant.number !== null) {
          value.set(participant.lid, participant.number)
        }
      }
      directories.set(key, { at: now(), value })
      return value
    },
  }
}
