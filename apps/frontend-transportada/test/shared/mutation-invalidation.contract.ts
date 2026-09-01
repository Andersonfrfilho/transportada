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
