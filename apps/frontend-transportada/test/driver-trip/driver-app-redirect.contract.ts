/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, describe, expect, it } from 'bun:test'

import {
  isDriverAppUrlOwnOrigin,
  resolveDriverAppRedirect,
  type DriverAppRedirectInput,
} from '@/modules/driver-trip/shared/driverAppRedirect.service'
import { isFieldOnlyUser } from '@/modules/driver-trip/shared/driverWorkspace.service'
import {
  assertDriverAppUrlBuildsClean,
  readDriverAppUrl,
} from '@/modules/identity/shared/identityEnvironment.config'

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

  /** Quem não é conta de campo escolhe a tela que quiser; a conta de campo não tem escolha (RF-E1). */
  it('fora da entrada do motorista, o escritório fica', () => {
    for (const pathname of ['/trips', '/notificacoes', '/minha-viagem/outra']) {
      expect(resolveDriverAppRedirect({ ...FIELD_OPENING, isFieldOnlyUser: false, pathname })).toBe(
        'stay',
      )
    }
  })
})

/** `authorization.policy.ts`: `driver` e `aggregate` têm só este par — é a conta de campo. */
const DRIVER_PERMISSIONS = ['trip.read', 'trip.report'] as const

/** `authorization.policy.ts`, papel `separator`: tem `trip.manage`, logo não é conta de campo. */
const SEPARATOR_PERMISSIONS = [
  'invoices.read',
  'fleet.read',
  'trip.read',
  'trip.manage',
  'cargo.measure',
] as const

/** Papéis `driver` + `separator` somados: o motorista que também monta viagem no painel. */
const DRIVER_AND_SEPARATOR_PERMISSIONS = [
  'trip.read',
  'trip.report',
  'invoices.read',
  'fleet.read',
  'trip.manage',
  'cargo.measure',
] as const

const PANEL_PATHS = ['/trips', '/cte-batches', '/billing', '/'] as const

function openingAs(
  permissions: readonly string[],
  overrides: Partial<DriverAppRedirectInput>,
): DriverAppRedirectInput {
  return {
    ...FIELD_OPENING,
    isFieldOnlyUser: isFieldOnlyUser(permissions),
    ...overrides,
  }
}

/** Spec 221 T1.2: o que já vale hoje e não pode se mexer quando a RF-E1 alargar a entrada. */
describe('regressão — a precedência e o painel do escritório continuam como estão', () => {
  it('pending-screen vem antes de tudo, inclusive do ícone instalado', () => {
    for (const overrides of [
      {},
      { isStandalone: true },
      { pathname: '/' },
    ] satisfies readonly Partial<DriverAppRedirectInput>[]) {
      expect(resolveDriverAppRedirect({ ...FIELD_OPENING, ...overrides, pendingTotal: 4 })).toBe(
        'pending-screen',
      )
    }
  })

  it('install-screen vem logo depois: sem pendência, aberto pelo ícone instalado', () => {
    expect(resolveDriverAppRedirect({ ...FIELD_OPENING, isStandalone: true })).toBe(
      'install-screen',
    )
  })

  it('/minha-viagem sem o interruptor é stay, mesmo com pendência e instalado', () => {
    expect(
      resolveDriverAppRedirect({
        ...FIELD_OPENING,
        driverAppUrl: undefined,
        isStandalone: true,
        pendingTotal: 5,
      }),
    ).toBe('stay')
  })

  /** É a chamada de `takeOverDriverEntry` (`main.tsx`): ainda não há `auth/me`, então `false`. */
  it('em /minha-viagem o caminho decide, com ou sem o dado de conta de campo', () => {
    expect(resolveDriverAppRedirect({ ...FIELD_OPENING, isFieldOnlyUser: false })).toBe('redirect')
    expect(
      resolveDriverAppRedirect({ ...FIELD_OPENING, isFieldOnlyUser: false, pendingTotal: 1 }),
    ).toBe('pending-screen')
  })

  it('o separador fica no painel em /trips, com e sem o interruptor', () => {
    expect(isFieldOnlyUser(SEPARATOR_PERMISSIONS)).toBe(false)
    expect(resolveDriverAppRedirect(openingAs(SEPARATOR_PERMISSIONS, { pathname: '/trips' }))).toBe(
      'stay',
    )
    expect(
      resolveDriverAppRedirect(
        openingAs(SEPARATOR_PERMISSIONS, { driverAppUrl: undefined, pathname: '/trips' }),
      ),
    ).toBe('stay')
  })
})

/** Spec 221 RF-E1..E3 (CA10, CA11, CA12): a conta de campo não abre o painel por caminho nenhum. */
describe('a conta de campo não abre o painel', () => {
  it('com o interruptor, qualquer caminho redireciona', () => {
    expect(isFieldOnlyUser(DRIVER_PERMISSIONS)).toBe(true)
    for (const pathname of PANEL_PATHS) {
      expect(resolveDriverAppRedirect(openingAs(DRIVER_PERMISSIONS, { pathname }))).toBe('redirect')
    }
  })

  it('sem o interruptor, qualquer caminho fora de /minha-viagem volta para a casa antiga', () => {
    for (const pathname of PANEL_PATHS) {
      expect(
        resolveDriverAppRedirect(
          openingAs(DRIVER_PERMISSIONS, { driverAppUrl: undefined, pathname }),
        ),
      ).toBe('legacy-home')
    }
  })

  it('a fila antiga pendente vence em qualquer caminho, e o ícone instalado vem depois', () => {
    for (const pathname of PANEL_PATHS) {
      expect(
        resolveDriverAppRedirect(openingAs(DRIVER_PERMISSIONS, { pathname, pendingTotal: 2 })),
      ).toBe('pending-screen')
      expect(
        resolveDriverAppRedirect(openingAs(DRIVER_PERMISSIONS, { isStandalone: true, pathname })),
      ).toBe('install-screen')
    }
  })
})

/** Spec 221 RF-E6 (CA16, primeira metade): quem monta viagem no painel não vai para o app do motorista. */
describe('o motorista que também é separador', () => {
  it('não é conta de campo e fica no painel em /trips', () => {
    expect(isFieldOnlyUser(DRIVER_AND_SEPARATOR_PERMISSIONS)).toBe(false)
    expect(
      resolveDriverAppRedirect(openingAs(DRIVER_AND_SEPARATOR_PERMISSIONS, { pathname: '/trips' })),
    ).toBe('stay')
    expect(
      resolveDriverAppRedirect(
        openingAs(DRIVER_AND_SEPARATOR_PERMISSIONS, {
          driverAppUrl: undefined,
          pathname: '/trips',
        }),
      ),
    ).toBe('stay')
  })
})

/**
 * ADR-0075 §6, revisão M1: `VITE_DRIVER_APP_URL` já é validada no build contra `VITE_APP_URL`
 * (`vite.config.ts`), mas a rede de segurança em runtime é o que impede o laço se o valor de um
 * serviço mudar depois do build.
 */
describe('isDriverAppUrlOwnOrigin (revisão M1)', () => {
  it('origem diferente não é a própria', () => {
    expect(
      isDriverAppUrlOwnOrigin({
        driverAppUrl: DRIVER_APP_URL,
        origin: 'https://app.example.com.br',
      }),
    ).toBe(false)
  })

  it('mesma origem é a própria, mesmo com caminho diferente', () => {
    expect(
      isDriverAppUrlOwnOrigin({
        driverAppUrl: `${DRIVER_APP_URL}/minha-viagem`,
        origin: DRIVER_APP_URL,
      }),
    ).toBe(true)
  })

  /** URL ilegível conta como "é a própria origem" — não redirecionar é sempre o lado seguro. */
  it('URL ilegível conta como a própria origem', () => {
    expect(isDriverAppUrlOwnOrigin({ driverAppUrl: 'não é url', origin: DRIVER_APP_URL })).toBe(
      true,
    )
  })
})

/**
 * ADR-0075 §6, revisão M1: falhar o `vite build` antes do bundle existir, em vez de só em runtime
 * dentro do navegador do motorista.
 */
describe('assertDriverAppUrlBuildsClean (revisão M1)', () => {
  it('ausente ou vazia não valida nada — o interruptor desligado é silencioso', () => {
    expect(() =>
      assertDriverAppUrlBuildsClean({
        appUrl: 'https://app.example.com.br',
        driverAppUrl: undefined,
      }),
    ).not.toThrow()
    expect(() =>
      assertDriverAppUrlBuildsClean({ appUrl: 'https://app.example.com.br', driverAppUrl: '  ' }),
    ).not.toThrow()
  })

  it('inválida falha o build, como `readTrustedUrl`', () => {
    expect(() =>
      assertDriverAppUrlBuildsClean({
        appUrl: 'https://app.example.com.br',
        driverAppUrl: 'http://motorista.example.com.br',
      }),
    ).toThrow('IDENTITY_CONFIGURATION_INVALID_VITE_DRIVER_APP_URL')
  })

  it('igual a VITE_APP_URL falha o build — laço de redirect consigo mesmo', () => {
    expect(() =>
      assertDriverAppUrlBuildsClean({
        appUrl: 'https://app.example.com.br',
        driverAppUrl: 'https://app.example.com.br/',
      }),
    ).toThrow('IDENTITY_CONFIGURATION_DRIVER_APP_URL_LOOP')
  })

  it('diferente de VITE_APP_URL passa', () => {
    expect(() =>
      assertDriverAppUrlBuildsClean({
        appUrl: 'https://app.example.com.br',
        driverAppUrl: DRIVER_APP_URL,
      }),
    ).not.toThrow()
  })

  it('sem VITE_APP_URL para comparar, só valida a própria', () => {
    expect(() =>
      assertDriverAppUrlBuildsClean({ appUrl: undefined, driverAppUrl: DRIVER_APP_URL }),
    ).not.toThrow()
  })
})
