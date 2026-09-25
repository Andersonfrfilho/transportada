/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, describe, expect, it } from 'bun:test'

import {
  resolveDriverAppRedirect,
  type DriverAppRedirectInput,
} from '@/modules/driver-trip/shared/driverAppRedirect.service'
import { readDriverAppUrl } from '@/modules/identity/shared/identityEnvironment.config'

const DRIVER_APP_URL = 'https://motorista.staging.example.com.br'

/** O motorista que abre `/minha-viagem` com a fila antiga vazia, fora do ícone instalado. */
const FIELD_OPENING: DriverAppRedirectInput = {
  driverAppUrl: DRIVER_APP_URL,
  isFieldOnlyUser: true,
  isStandalone: false,
  pathname: '/minha-viagem',
  pendingTotal: 0,
}

/**
 * ADR-0075 §6: `VITE_DRIVER_APP_URL` é **interruptor**, não configuração obrigatória. O código
 * publica desligado, e o painel só é religado quando `motorista.<ambiente>` já está no ar — por
 * isso a ausência da variável precisa ser o caminho de sempre, sem lançar.
 */
describe('o interruptor da casa nova do motorista', () => {
  const previousValue = process.env.VITE_DRIVER_APP_URL

  afterEach(() => {
    if (previousValue === undefined) delete process.env.VITE_DRIVER_APP_URL
    else process.env.VITE_DRIVER_APP_URL = previousValue
  })

  it('ausente, devolve undefined sem lançar', () => {
    delete process.env.VITE_DRIVER_APP_URL

    expect(readDriverAppUrl()).toBeUndefined()
  })

  it('vazia ou só com espaço, devolve undefined sem lançar', () => {
    process.env.VITE_DRIVER_APP_URL = ''
    expect(readDriverAppUrl()).toBeUndefined()

    process.env.VITE_DRIVER_APP_URL = '   '
    expect(readDriverAppUrl()).toBeUndefined()
  })

  it('presente, passa pela mesma validação das outras origens', () => {
    process.env.VITE_DRIVER_APP_URL = `${DRIVER_APP_URL}/`
    expect(readDriverAppUrl()).toBe(DRIVER_APP_URL)

    process.env.VITE_DRIVER_APP_URL = 'http://localhost:53200'
    expect(readDriverAppUrl()).toBe('http://localhost:53200')
  })

  /** Ligado com valor errado é erro de configuração, e ele aparece — nunca vira `stay` calado. */
  it('presente e não confiável, recusa como as outras origens', () => {
    process.env.VITE_DRIVER_APP_URL = 'http://motorista.example.com.br'

    expect(() => readDriverAppUrl()).toThrow('IDENTITY_CONFIGURATION_INVALID_VITE_DRIVER_APP_URL')
  })
})

describe('para onde o painel manda o motorista', () => {
  /**
   * ⚠️ **O caso que não pode quebrar.** Sem a variável o painel serve `/minha-viagem` como sempre —
   * com fila, sem fila, instalado ou não. É o que permite publicar o código antes da casa nova.
   */
  it('sem a variável, fica, e o painel serve /minha-viagem', () => {
    for (const overrides of [
      {},
      { pendingTotal: 3 },
      { isStandalone: true },
      { isFieldOnlyUser: false, pathname: '/' },
      { pathname: '/' },
    ] satisfies readonly Partial<DriverAppRedirectInput>[]) {
      expect(
        resolveDriverAppRedirect({ ...FIELD_OPENING, ...overrides, driverAppUrl: undefined }),
      ).toBe('stay')
    }
  })

  it('com a fila vazia, redireciona', () => {
    expect(resolveDriverAppRedirect(FIELD_OPENING)).toBe('redirect')
  })

  /** A entrada de quem é do campo (spec 057 RF-6) também leva à casa nova. */
  it('o motorista que abre a raiz também vai para a casa nova', () => {
    expect(resolveDriverAppRedirect({ ...FIELD_OPENING, pathname: '/' })).toBe('redirect')
  })

  /**
   * O ícone antigo abre o painel em `standalone`: um `location.replace` para outra origem sairia do
   * `scope` e cairia numa aba solta. A tela explica e oferece o link.
   */
  it('aberto pelo ícone instalado, mostra a tela de instalar o app novo', () => {
    expect(resolveDriverAppRedirect({ ...FIELD_OPENING, isStandalone: true })).toBe(
      'install-screen',
    )
  })

  /** A fila antiga mora no IndexedDB **desta** origem: ela só sai daqui. Pendência vem primeiro. */
  it('com pendência, mostra só a tela de pendências', () => {
    expect(resolveDriverAppRedirect({ ...FIELD_OPENING, pendingTotal: 2 })).toBe('pending-screen')
    expect(
      resolveDriverAppRedirect({ ...FIELD_OPENING, isStandalone: true, pendingTotal: 1 }),
    ).toBe('pending-screen')
  })

  it('o escritório fica', () => {
    expect(
      resolveDriverAppRedirect({ ...FIELD_OPENING, isFieldOnlyUser: false, pathname: '/' }),
    ).toBe('stay')
  })

  /** Só `/` e `/minha-viagem` são a entrada do motorista; qualquer outra tela é escolha dele. */
  it('fora da entrada do motorista, fica', () => {
    for (const pathname of ['/trips', '/notificacoes', '/minha-viagem/outra']) {
      expect(resolveDriverAppRedirect({ ...FIELD_OPENING, pathname })).toBe('stay')
    }
  })
})
