/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.3 (ADR-0110 §6 e §11, D6/D11): o assinante, o cargo resolvido, a porta de dono nula e o rótulo do papel.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_ROLES } from '../../src/database/identity.schema.js'
import { COMPANY_ROLE_LABELS } from '../../src/identity/domain/company-role-label.constant.js'
import {
  NULL_OCCURRENCE_OWNER_READER,
  type OccurrenceOwnerReader,
} from '../../src/occurrence-conversation/application/occurrence-owner-reader.port.js'
import { resolveAutomaticMailSigner } from '../../src/occurrence-conversation/application/resolve-automatic-mail-signer.service.js'
import {
  buildInitials,
  buildSignerValues,
  resolveSignerJobTitle,
} from '../../src/occurrence-conversation/domain/occurrence-mail-signer.policy.js'

const IDENTITY_LOCALE = new URL(
  '../../../frontend-transportada/src/modules/identity/locales/identity.locale.json',
  import.meta.url,
)

describe('spec 272 D6: o cargo do assinante', () => {
  test.each([
    {
      expected: 'Gerente de Operações',
      jobTitle: 'Gerente de Operações',
      label: 'o cargo livre vence',
      roles: ['operator'],
    },
    {
      expected: 'Operação',
      jobTitle: null,
      label: 'sem cargo, o rótulo do papel',
      roles: ['operator'],
    },
    {
      expected: 'Financeiro',
      jobTitle: '   ',
      label: 'cargo em branco cai no papel',
      roles: ['finance'],
    },
    {
      expected: 'Operação',
      jobTitle: undefined,
      label: 'vários papéis: o primeiro na ordem de COMPANY_ROLES, não na do argumento',
      roles: ['viewer', 'operator'],
    },
    {
      expected: 'Administrador',
      jobTitle: null,
      label: 'administrador antes do ajudante',
      roles: ['helper', 'company-admin'],
    },
    { expected: undefined, jobTitle: null, label: 'nem cargo nem papel: ausente', roles: [] },
  ] as const)('$label', ({ expected, jobTitle, roles }) => {
    expect<string | undefined>(resolveSignerJobTitle({ directRoles: roles, jobTitle })).toBe(
      expected,
    )
  })
})

describe('spec 272 D11: o rótulo do papel', () => {
  test('um rótulo para cada papel, e só para eles', () => {
    expect(Object.keys(COMPANY_ROLE_LABELS).sort()).toEqual([...COMPANY_ROLES].sort())
  })

  test('é cópia do identity.locale.json do painel (operator = Operação)', async () => {
    const locale = (await Bun.file(IDENTITY_LOCALE).json()) as {
      readonly users: { readonly role: Readonly<Record<string, string>> }
    }
    const panelRoles = Object.keys(locale.users.role)
    expect(panelRoles.length).toBeGreaterThanOrEqual(9)
    for (const role of panelRoles) {
      expect<string>(COMPANY_ROLE_LABELS[role as keyof typeof COMPANY_ROLE_LABELS]).toBe(
        locale.users.role[role] ?? '',
      )
    }
    expect(COMPANY_ROLE_LABELS.operator).toBe('Operação')
  })

  test('os papéis que o painel não rotula têm rótulo próprio, não vazio', () => {
    expect(COMPANY_ROLE_LABELS.contractor).not.toBe('')
    expect(COMPANY_ROLE_LABELS.automation).not.toBe('')
  })
})

describe('spec 272 D6: as variáveis do assinante', () => {
  test('iniciais: primeiras letras das duas primeiras palavras, em maiúscula', () => {
    expect(buildInitials('Maria da Silva')).toBe('MD')
    expect(buildInitials('alfa transportes ltda')).toBe('AT')
    expect(buildInitials('  Zé  ')).toBe('Z')
    expect(buildInitials('Ágata Çelik')).toBe('ÁÇ')
    expect(buildInitials('')).toBe('')
    expect(buildInitials('— · —')).toBe('')
  })

  test('operador com cargo', () => {
    expect(
      buildSignerValues({
        companyDisplayName: 'Alfa Transportes',
        signer: { jobTitle: 'Analista', kind: 'operator', name: 'Maria Souza', userId: 'u1' },
      }),
    ).toEqual({
      assinaturaCargo: 'Analista',
      assinaturaIniciais: 'MS',
      assinaturaNome: 'Maria Souza',
    })
  })

  test('dono sem cargo: cargo vazio', () => {
    expect(
      buildSignerValues({
        companyDisplayName: 'Alfa Transportes',
        signer: { kind: 'owner', name: 'João Lima', userId: 'u2' },
      }),
    ).toEqual({ assinaturaCargo: '', assinaturaIniciais: 'JL', assinaturaNome: 'João Lima' })
  })

  test('equipe: "Equipe <nome de exibição>" e as iniciais do nome de exibição', () => {
    expect(
      buildSignerValues({
        companyDisplayName: 'Alfa Transportes',
        signer: { kind: 'team' },
      }),
    ).toEqual({
      assinaturaCargo: '',
      assinaturaIniciais: 'AT',
      assinaturaNome: 'Equipe Alfa Transportes',
    })
  })
})

describe('spec 272 D6: a porta de dono (critério 12)', () => {
  const PARAMS = { companyId: 'c1', kind: 'document', occurrenceId: 'o1' } as const

  test('a implementação nula nunca acha dono', async () => {
    expect(await NULL_OCCURRENCE_OWNER_READER.findEligibleOwner(PARAMS)).toBeUndefined()
  })

  test('sem dono, a equipe assina', async () => {
    expect(
      await resolveAutomaticMailSigner({ ...PARAMS, ownerReader: NULL_OCCURRENCE_OWNER_READER }),
    ).toEqual({
      kind: 'team',
    })
  })

  test('dono injetado: assina como dono, com o cargo que a porta devolveu', async () => {
    const calls: unknown[] = []
    const ownerReader: OccurrenceOwnerReader = {
      async findEligibleOwner(params) {
        calls.push(params)
        return { jobTitle: 'Coordenadora', name: 'Ana Dona', userId: 'u9' }
      },
    }

    expect(await resolveAutomaticMailSigner({ ...PARAMS, ownerReader })).toEqual({
      jobTitle: 'Coordenadora',
      kind: 'owner',
      name: 'Ana Dona',
      userId: 'u9',
    })
    expect(calls).toEqual([PARAMS])
  })

  test('dono sem cargo: o assinante não ganha a chave jobTitle', async () => {
    const ownerReader: OccurrenceOwnerReader = {
      findEligibleOwner: async () => ({ name: 'Ana Dona', userId: 'u9' }),
    }

    const signer = await resolveAutomaticMailSigner({ ...PARAMS, ownerReader })
    expect(signer).toEqual({ kind: 'owner', name: 'Ana Dona', userId: 'u9' })
    expect(Object.hasOwn(signer, 'jobTitle')).toBe(false)
  })
})
