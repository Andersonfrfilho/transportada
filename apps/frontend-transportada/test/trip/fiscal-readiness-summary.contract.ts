/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * RF8/CA07 (spec 175, ADR-0071): o `state` da prontidão fiscal responde só pelo manifesto — uma
 * viagem com nota `ok` de CT-e e nota `nfse_expected` pendente já é `ready` para o MDF-e (spec 065
 * D4, contrato em `trip-fiscal-readiness/readiness.contract.ts`), e essa semântica não muda aqui.
 * O defeito é o resumo que o operador lê: `readiness.state.ready` diz "Todas as notas têm CT-e
 * autorizado" sem citar a nota que ainda espera NFS-e, e o cabeçalho resume só "X de Y" sem separar
 * o que é NFS-e do que é CT-e. A correção é contar a NFS-e pendente junto, não recalcular o state.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const PAINEL = new URL(
  '../../src/modules/trip/components/TripFiscalReadinessPanel.component.tsx',
  import.meta.url,
)
const CABECALHO = new URL(
  '../../src/modules/trip/components/TripHeaderActions.component.tsx',
  import.meta.url,
)
const LOCALE_PT = new URL('../../src/modules/trip/locales/trip.locale.json', import.meta.url)
const LOCALE_EN = new URL('../../src/modules/trip/locales/trip.en.locale.json', import.meta.url)

describe('o resumo de prontidão conta a NFS-e pendente (spec 175 RF8/CA07)', () => {
  const painel = readFileSync(PAINEL, 'utf8')
  const cabecalho = readFileSync(CABECALHO, 'utf8')
  const localePt = JSON.parse(readFileSync(LOCALE_PT, 'utf8')) as Record<string, unknown>
  const localeEn = JSON.parse(readFileSync(LOCALE_EN, 'utf8')) as Record<string, unknown>

  function ler(locale: Record<string, unknown>, caminho: string): unknown {
    return caminho
      .split('.')
      .reduce<unknown>(
        (atual, chave) =>
          typeof atual === 'object' && atual !== null
            ? (atual as Record<string, unknown>)[chave]
            : undefined,
        locale,
      )
  }

  it('o painel informa quantas notas aguardam NFS-e, não só o state do CT-e', () => {
    expect(painel).toContain('readiness.nfseCount')
    expect(painel).toContain("t('readiness.nfsePending'")
  })

  it('o cabeçalho distingue a nota que aguarda NFS-e do total genérico', () => {
    expect(cabecalho).toContain('fiscalReadiness.nfseCount')
  })

  it('as duas locales têm o texto de NFS-e pendente, singular e plural', () => {
    expect(ler(localePt, 'readiness.nfsePending_one')).toBeTypeOf('string')
    expect(ler(localePt, 'readiness.nfsePending_other')).toBeTypeOf('string')
    expect(ler(localeEn, 'readiness.nfsePending_one')).toBeTypeOf('string')
    expect(ler(localeEn, 'readiness.nfsePending_other')).toBeTypeOf('string')
  })
})
