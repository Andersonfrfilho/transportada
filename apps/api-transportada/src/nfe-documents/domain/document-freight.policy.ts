/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  calculatePercentageFreight,
  createFreightRuleSnapshot,
} from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import {
  matchesFreightRuleFilters,
  type FreightRuleVersionFilters,
} from '../../freight-rules/domain/freight-rule-filters.policy.js'

export type DocumentFreightRule = {
  readonly filters: FreightRuleVersionFilters
  readonly freightRuleId: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly name: string
  readonly percentage: string
  readonly priority: bigint
  readonly validFrom: Date
  readonly validUntil: Date | null
}

export type ResolvedDocumentFreight = {
  readonly amount: string
  readonly freightRuleId: string
  readonly freightRuleName: string
  readonly percentage: string
}

export type ResolveDocumentFreightParams = {
  readonly destinationCityCode: string | null
  readonly destinationState: string | null
  readonly issuedAt: Date
  readonly rules: readonly DocumentFreightRule[]
  readonly senderTaxId: string | null
  readonly totalAmount: string | null
}

/**
 * Quanto a nota rende de frete pela parametrização vigente, para a **listagem** — a mesma pergunta
 * que a conta da viagem responde por `findApplicableRule`, feita aqui sobre regras já carregadas.
 *
 * ⚠️ **A ordem é a mesma do seletor da viagem**: maior prioridade vence e, no empate, a vigência
 * mais recente. Divergir dela faria a coluna da listagem e o número da parada discordarem para a
 * mesma nota, que é pior do que não ter a coluna.
 *
 * ⚠️ **Empate não é resolvido, é denunciado.** Duas regras igualmente boas devolvem `null`: o
 * seletor da viagem escolhe uma calado (`limit 1`), e reproduzir esse silêncio aqui esconderia
 * exatamente a configuração que precisa ser corrigida. Célula vazia manda alguém olhar; número
 * arbitrário, não.
 *
 * ⚠️ Sobre nota **sem CNPJ de emitente**, esta política usa `matchesFreightRuleFilters`, que recusa
 * a regra filtrada — enquanto o `~` do Postgres em `versionSelectorMatches` a aceita. A divergência
 * é anterior a esta função e está registrada; com filtro vazio, que é o caso hoje, as duas
 * concordam.
 */
export function resolveDocumentFreight(
  input: ResolveDocumentFreightParams,
): ResolvedDocumentFreight | null {
  if (input.totalAmount === null) return null

  const applicable = input.rules
    .filter((rule) => isInForce(rule, input.issuedAt))
    .filter((rule) =>
      matchesFreightRuleFilters({
        destinationCityCode: input.destinationCityCode,
        destinationState: input.destinationState,
        filters: rule.filters,
        senderTaxId: input.senderTaxId,
      }),
    )
    .toSorted(comparePreference)

  const [best, runnerUp] = applicable
  if (best === undefined) return null
  if (runnerUp !== undefined && comparePreference(best, runnerUp) === 0) return null

  const calculation = calculatePercentageFreight({
    invoice: {
      id: best.freightRuleId,
      issuedAt: input.issuedAt.toISOString(),
      totalAmount: input.totalAmount,
    },
    ruleSnapshot: createFreightRuleSnapshot({
      freightRuleId: best.freightRuleId,
      freightRuleVersionId: best.freightRuleId,
      maximumAmount: best.maximumAmount,
      minimumAmount: best.minimumAmount,
      percentage: best.percentage,
      ruleVersion: '0',
      type: 'percentage_of_invoice_total',
      validFrom: best.validFrom.toISOString(),
      validUntil: best.validUntil?.toISOString() ?? null,
    }),
  })

  return {
    amount: calculation.totalAmount,
    freightRuleId: best.freightRuleId,
    freightRuleName: best.name,
    percentage: best.percentage,
  }
}

function isInForce(rule: DocumentFreightRule, issuedAt: Date): boolean {
  if (rule.validFrom.getTime() > issuedAt.getTime()) return false
  return rule.validUntil === null || rule.validUntil.getTime() >= issuedAt.getTime()
}

/** Maior prioridade primeiro; no empate, a vigência mais recente. Zero significa empate de fato. */
function comparePreference(left: DocumentFreightRule, right: DocumentFreightRule): number {
  if (left.priority !== right.priority) return left.priority > right.priority ? -1 : 1
  const byValidFrom = right.validFrom.getTime() - left.validFrom.getTime()
  return byValidFrom === 0 ? 0 : byValidFrom
}
