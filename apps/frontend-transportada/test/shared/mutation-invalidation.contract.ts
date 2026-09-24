/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Glob } from 'bun'
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import {
  BILLING_DOCUMENTS_QUERY_KEY,
  BILLING_ELIGIBLE_LIST_QUERY_KEY,
  BILLING_INVOICE_LIST_QUERY_KEY,
  BILLING_INVOICE_QUERY_KEY,
} from '@/modules/billing/shared/billingQueryKey.constant'
import {
  COMPANY_CTE_ITEM_SUMMARY_QUERY_KEY,
  COMPANY_CTE_ITEMS_QUERY_KEY,
} from '@/modules/cte-batch/queries/cteBatchItems.query'
import { CTE_EMISSION_PREVIEW_QUERY_KEY } from '@/modules/nfe-workspace/shared/cteEmission.service'
import { NFE_DOCUMENTS_QUERY_KEY } from '@/modules/nfe-workspace/shared/nfeWorkspace.constant'
import { NFSE_EMISSION_PREVIEW_QUERY_KEY } from '@/modules/nfse-invoice/shared/nfseEmission.service'
import { PACKAGE_BOX_QUERY_KEY } from '@/modules/nfe-workspace/hooks/usePackageBoxQueue.hook'
import { SUGGESTION_VALUATION_QUERY_ROOT } from '@/modules/routing/queries/useSuggestionValuation.query'
import { TRIP_VALUATION_PREVIEW_QUERY_KEY } from '@/modules/trip-financials/hooks/useTripValuationPreview.hook'
import { TRIP_CARGO_PREVIEW_QUERY_KEY } from '@/modules/trip/hooks/useTripCargoPreview.hook'
import { TRIP_CARGO_LAYOUT_QUERY_KEY } from '@/modules/trip/queries/useTripCargoLayout.query'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
  MUTATION_EFFECT_QUERY_KEYS,
} from '@/modules/shared/mutationInvalidation.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const HOOK_PATTERN = 'src/modules/*/hooks/*.hook.ts'

/**
 * Quem produz o efeito, e por quê. A lista é explícita de propósito: ela é o que um contrato
 * consegue cobrar. O que ele não consegue é adivinhar que a mutação nova de amanhã também mexe no
 * vínculo — para isso existe a regra escrita em `docs/frontend/mutations.md`, e o registro de
 * efeitos, que é o único lugar onde o alcance mora.
 */
const EFFECT_PRODUCERS: Readonly<Record<string, readonly string[]>> = {
  /**
   * Reservar um CT-e em fatura e devolvê-lo mudam a mesma lista. A devolução era o lado esquecido:
   * `useBillingBulkCancel` só invalidava a lista de faturas, e a coluna "Faturado" da tabela de
   * CT-es continuava dizendo que o documento estava preso a uma fatura já cancelada.
   */
  [MUTATION_EFFECT.billingInvoiceItem]: [
    'src/modules/billing/hooks/useBillingBulkCancel.hook.ts',
    'src/modules/billing/hooks/useBillingWorkspace.hook.ts',
    'src/modules/cte-batch/hooks/useCteBillingDialog.hook.ts',
  ],
  /**
   * O checkbox da tabela de notas é desenhado pelo bloqueio que a API resolveu (`cteBlockReason`).
   * Emitir prende a nota e as duas telas de emissão invalidavam; descartar, cancelar a NFS-e,
   * cancelar o lote e remover o item soltam a nota, e nenhuma das quatro invalidava — a nota
   * ficava impossível de selecionar até o F5.
   */
  [MUTATION_EFFECT.nfeDocumentLink]: [
    'src/modules/cte-batch/hooks/useCteBatchItems.hook.ts',
    'src/modules/cte-batch/hooks/useCteBatchWorkspace.hook.ts',
    'src/modules/nfe-workspace/hooks/useCteEmissionDialog.hook.ts',
    'src/modules/nfse-invoice/hooks/useNfseEmissionDialog.hook.ts',
    'src/modules/nfse-invoice/hooks/useNfseInvoiceBulkCancel.hook.ts',
    'src/modules/nfse-invoice/hooks/useNfseInvoiceBulkDiscard.hook.ts',
    'src/modules/nfse-invoice/hooks/useNfseInvoiceRowActions.hook.ts',
    'src/modules/trip/hooks/useTripWorkspace.hook.ts',
  ],
  /**
   * A medida nova da caixa muda a planta e a conta de quem está montando a viagem. A fila de medição
   * invalidava só a si mesma, e o operador voltava para a montagem com a planta da caixa sem medida.
   * A montagem invalida o mesmo alcance ao restaurar o rascunho: o recarregamento zera o cache, mas
   * a volta pelo menu não.
   */
  [MUTATION_EFFECT.packageBoxMeasurement]: [
    'src/modules/nfe-workspace/hooks/usePackageBoxQueue.hook.ts',
    'src/modules/trip/hooks/useQuickCreateDraft.hook.ts',
    'src/modules/trip/hooks/useRouteAssemblyDraft.hook.ts',
  ],
  /**
   * O vínculo entrava só pela lista de notas e pelas duas prévias de emissão (`nfeDocumentLink`).
   * Planta de carga, prévia e valuation da viagem seguiam mostrando o número de antes de vincular.
   */
  [MUTATION_EFFECT.tripCargoLink]: ['src/modules/trip/hooks/useTripWorkspace.hook.ts'],
}

const CROSS_MODULE_IMPORT_PATTERN = /import (?:type )?\{([^}]*)\} from '@\/modules\/([a-z-]+)\//g

async function readSource(relativePath: string): Promise<string> {
  return Bun.file(new URL(relativePath, APPLICATION_ROOT)).text()
}

/** `src/modules/<modulo>/hooks/x.hook.ts` → `<modulo>`. */
function moduleOf(relativePath: string): string {
  return relativePath.split('/')[2] ?? ''
}

async function listHookFiles(): Promise<readonly string[]> {
  const root = fileURLToPath(APPLICATION_ROOT)
  const found: string[] = []
  for await (const file of new Glob(HOOK_PATTERN).scan(root)) found.push(file)
  return found.sort()
}

describe('contrato de invalidação entre módulos', () => {
  /**
   * A lista de notas é a tela de destino de todo vínculo: ela mostra o bloqueio, e as duas prévias
   * de emissão mostram o mesmo bloqueio antes de emitir. Tirar qualquer uma daqui devolve o bug.
   */
  test('o vínculo da nota alcança a listagem e as duas prévias de emissão', () => {
    expect(MUTATION_EFFECT_QUERY_KEYS[MUTATION_EFFECT.nfeDocumentLink]).toEqual([
      CTE_EMISSION_PREVIEW_QUERY_KEY,
      NFE_DOCUMENTS_QUERY_KEY,
      NFSE_EMISSION_PREVIEW_QUERY_KEY,
    ])
  })

  /**
   * Faturar consome o CT-e e cancelar a fatura o devolve: as duas pontas mexem na elegibilidade,
   * na lista de faturas, no detalhe e na coluna "Faturado" da tabela de CT-es — com a soma, que é
   * lida de outra chave.
   */
  test('a reserva do CT-e alcança elegíveis, faturas e a tabela de CT-es', () => {
    expect(MUTATION_EFFECT_QUERY_KEYS[MUTATION_EFFECT.billingInvoiceItem]).toEqual([
      BILLING_DOCUMENTS_QUERY_KEY,
      BILLING_ELIGIBLE_LIST_QUERY_KEY,
      BILLING_INVOICE_QUERY_KEY,
      BILLING_INVOICE_LIST_QUERY_KEY,
      COMPANY_CTE_ITEM_SUMMARY_QUERY_KEY,
      COMPANY_CTE_ITEMS_QUERY_KEY,
    ])
  })

  /**
   * Medir ou replicar a medida alcança a fila de medição e tudo que a montagem de viagem desenha a
   * partir da caixa: planta da prévia, planta da viagem, conta da prévia e conta da proposta.
   */
  test('a medida da caixa alcança a fila, as plantas e as contas da montagem', () => {
    expect(MUTATION_EFFECT_QUERY_KEYS[MUTATION_EFFECT.packageBoxMeasurement]).toEqual([
      PACKAGE_BOX_QUERY_KEY,
      SUGGESTION_VALUATION_QUERY_ROOT,
      TRIP_CARGO_LAYOUT_QUERY_KEY,
      TRIP_CARGO_PREVIEW_QUERY_KEY,
      TRIP_VALUATION_PREVIEW_QUERY_KEY,
    ])
  })

  /**
   * Vincular ou soltar uma nota na viagem recongela rota e pedágio no servidor e recalcula planta e
   * valuation — a mesma conta da montagem, disparada por outro produtor.
   */
  test('o vínculo de nota na viagem alcança a rota, as plantas e as contas da montagem', () => {
    expect(MUTATION_EFFECT_QUERY_KEYS[MUTATION_EFFECT.tripCargoLink]).toEqual([
      SUGGESTION_VALUATION_QUERY_ROOT,
      TRIP_CARGO_LAYOUT_QUERY_KEY,
      TRIP_CARGO_PREVIEW_QUERY_KEY,
      TRIP_VALUATION_PREVIEW_QUERY_KEY,
    ])
  })

  /** Uma invalidação por chave: chave agrupada invalidaria só o prefixo comum, que não existe. */
  test('o efeito invalida uma consulta por chave declarada', async () => {
    const invalidated: string[][] = []

    await invalidateMutationEffect({
      effect: MUTATION_EFFECT.nfeDocumentLink,
      queryClient: {
        invalidateQueries: (filters) => {
          invalidated.push([...filters.queryKey])
          return Promise.resolve()
        },
      },
    })

    expect(invalidated).toEqual(
      MUTATION_EFFECT_QUERY_KEYS[MUTATION_EFFECT.nfeDocumentLink].map((key) => [key]),
    )
  })

  for (const [effect, producers] of Object.entries(EFFECT_PRODUCERS)) {
    for (const producer of producers) {
      test(`${producer} declara o efeito ${effect}`, async () => {
        const source = await readSource(producer)

        expect(source).toContain('invalidateMutationEffect')
        expect(source).toContain(`MUTATION_EFFECT.${effect}`)
      })
    }
  }

  /**
   * A regra que impede o próximo caso: invalidar lista de outro módulo só pelo registro. Enquanto
   * cada hook montava a própria chamada, o alcance ficava espalhado por dez arquivos e ninguém
   * conseguia ver o que uma ação mexia — foi assim que quatro delas nasceram incompletas.
   */
  test('nenhum hook invalida a chave de outro módulo por conta própria', async () => {
    const offenders: string[] = []

    for (const file of await listHookFiles()) {
      const source = await readSource(file)
      const owner = moduleOf(file)
      for (const match of source.matchAll(CROSS_MODULE_IMPORT_PATTERN)) {
        const imported = match[2] ?? ''
        if (imported === owner || imported === 'shared') continue
        for (const name of (match[1] ?? '').split(',').map((entry) => entry.trim())) {
          if (!name.endsWith('_QUERY_KEY')) continue
          if (new RegExp(`invalidateQueries\\(\\{\\s*queryKey:\\s*\\[${name}`).test(source)) {
            offenders.push(`${file} → ${name}`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
