/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isQueryableCompanyTaxId,
  lookupCompanyLegalName,
} from '@/modules/fleet/shared/companyLookup.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const DIALOG_PATH = 'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx'
const FORM_PATH = 'src/modules/fleet/components/DriverForm.component.tsx'
const GUARD_PATH = 'src/modules/shared/useGuardedRequest.hook.ts'
const HOOK_PATH = 'src/modules/fleet/hooks/useCompanyLookup.hook.ts'
const NUMERIC_TAX_ID = '19131243000197'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** O `fetch` do Bun declara `preconnect`, que nenhum duplo de teste precisa implementar. */
function stubFetch(
  handler: (input: RequestInfo | URL) => Promise<Response>,
): typeof globalThis.fetch {
  return handler as typeof globalThis.fetch
}

function respondWith(body: unknown, status = 200): typeof globalThis.fetch {
  return stubFetch(() => Promise.resolve(Response.json(body, { status })))
}

describe('fleet company lookup contract', () => {
  /**
   * O provedor público indexa o CNPJ por dígito: o alfanumérico da IN RFB 2229/2024 não tem
   * consulta, e perguntar por ele daria 404 em todo cadastro de base com letra.
   */
  test('só o CNPJ numérico completo vai à rede', () => {
    expect(isQueryableCompanyTaxId(NUMERIC_TAX_ID)).toBe(true)
    expect(isQueryableCompanyTaxId('1913124300019')).toBe(false)
    expect(isQueryableCompanyTaxId('191312430001977')).toBe(false)
    expect(isQueryableCompanyTaxId('12ABC34501DE35')).toBe(false)
    expect(isQueryableCompanyTaxId('')).toBe(false)
  })

  test('a consulta devolve a razão social do CNPJ pedido', async () => {
    const requests: string[] = []

    const legalName = await lookupCompanyLegalName({
      fetch: stubFetch((input) => {
        requests.push(new Request(input).url)
        return Promise.resolve(
          Response.json({
            cnpj: NUMERIC_TAX_ID,
            nome_fantasia: 'Transportes Boa Vista',
            razao_social: 'BOA VISTA TRANSPORTES LTDA',
          }),
        )
      }),
      signal: new AbortController().signal,
      taxId: NUMERIC_TAX_ID,
    })

    expect(requests).toEqual([`https://brasilapi.com.br/api/cnpj/v1/${NUMERIC_TAX_ID}`])
    expect(legalName).toBe('BOA VISTA TRANSPORTES LTDA')
  })

  /** CNPJ que não existe não é erro de tela: o operador digita a razão social e segue. */
  test('CNPJ desconhecido e corpo sem razão social não sugerem nada', async () => {
    const signal = new AbortController().signal

    expect(
      await lookupCompanyLegalName({
        fetch: respondWith({ message: 'CNPJ inválido' }, 404),
        signal,
        taxId: NUMERIC_TAX_ID,
      }),
    ).toBeNull()
    expect(
      await lookupCompanyLegalName({
        fetch: respondWith({ razao_social: '   ' }),
        signal,
        taxId: NUMERIC_TAX_ID,
      }),
    ).toBeNull()
    expect(
      await lookupCompanyLegalName({
        fetch: respondWith(['BOA VISTA TRANSPORTES LTDA']),
        signal,
        taxId: NUMERIC_TAX_ID,
      }),
    ).toBeNull()
  })

  /**
   * A corrida é a mesma do CEP — o provedor mais lento responde por último —, então a guarda é
   * uma só para os dois casos, e os dois formulários de motorista consultam pelo mesmo hook.
   */
  test('a guarda de corrida é compartilhada, e os dois formulários usam o mesmo hook', async () => {
    const [dialog, form, guard, hook] = await Promise.all([
      readApplicationFile(DIALOG_PATH),
      readApplicationFile(FORM_PATH),
      readApplicationFile(GUARD_PATH),
      readApplicationFile(HOOK_PATH),
    ])

    expect(guard).toContain('export function useGuardedRequest')
    expect(hook).toContain('useGuardedRequest()')
    expect(hook).toContain('isQueryableCompanyTaxId(')
    expect(hook).toContain('linkedLegalName')
    expect(dialog).toContain('useCompanyLookup(')
    expect(form).toContain('useCompanyLookup(')
  })
})
