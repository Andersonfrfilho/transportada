/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 272 T4.1 (ADR-0110 D10): o cargo do usuário da empresa. Lê-se de lista e detalhe, vai no PATCH existente como
 * `jobTitle` (texto ou `null` para limpar) e o diálogo o oferece com ajuda e limite de 80.
 */
import { describe, expect, test } from 'bun:test'

import {
  JOB_TITLE_MAX_LENGTH,
  resolveJobTitleChange,
} from '../../src/modules/identity/shared/companyUserJobTitle.service'
import { createCompanyUsersClient } from '../../src/modules/identity/shared/companyUsersClient.service'
import { toCompanyUser } from '../../src/modules/identity/shared/companyUsersResponse.validation'

const USER_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93'
const CORE = {
  contact: { channel: 'email', masked: 'a***@example.test' },
  email: 'a***@example.test',
  id: USER_ID,
  membershipId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e94',
  name: 'Ana Operação',
  phone: '***88',
  roles: ['operator'],
  status: 'active',
  taxId: '***09',
  username: 'ana.operacao',
}

function recordingClient() {
  const bodies: unknown[] = []
  const client = createCompanyUsersClient({
    apiUrl: 'https://api.example.test',
    fetch: async (input, init) => {
      bodies.push(await new Request(input, init).json())
      return Response.json({ data: CORE })
    },
    getAccessToken: () => Promise.resolve('synthetic-access-token'),
    newIdempotencyKey: () => 'synthetic-idempotency-key',
  })
  return { bodies, client }
}

describe('o cargo é lido da resposta', () => {
  test('texto, nulo e ausente', () => {
    expect(toCompanyUser({ ...CORE, jobTitle: 'Coordenadora' }).jobTitle).toBe('Coordenadora')
    expect(toCompanyUser({ ...CORE, jobTitle: null }).jobTitle).toBeUndefined()
    expect(toCompanyUser(CORE).jobTitle).toBeUndefined()
  })
})

describe('o cargo vai no PATCH existente', () => {
  test('texto vai como jobTitle; vazio limpa com null; ausente não é enviado', async () => {
    const { bodies, client } = recordingClient()

    await client.updateProfile({ jobTitle: 'Coordenadora', userId: USER_ID })
    await client.updateProfile({ jobTitle: null, userId: USER_ID })
    await client.updateProfile({ name: 'Ana', userId: USER_ID })

    expect(bodies).toEqual([{ jobTitle: 'Coordenadora' }, { jobTitle: null }, { name: 'Ana' }])
  })
})

describe('resolveJobTitleChange', () => {
  test('o limite é 80', () => {
    expect(JOB_TITLE_MAX_LENGTH).toBe(80)
  })

  test('igual ao atual não muda; texto novo muda; vazio limpa só se havia cargo', () => {
    expect(resolveJobTitleChange('Analista', 'Analista')).toBeUndefined()
    expect(resolveJobTitleChange('  Analista  ', 'Analista')).toBeUndefined()
    expect(resolveJobTitleChange('Gerente', 'Analista')).toBe('Gerente')
    expect(resolveJobTitleChange('Gerente', undefined)).toBe('Gerente')
    expect(resolveJobTitleChange('   ', 'Analista')).toBeNull()
    expect(resolveJobTitleChange('', undefined)).toBeUndefined()
  })
})

describe('o diálogo e a lista', () => {
  const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text()

  test('o campo tem ajuda e contador nos dois idiomas', async () => {
    for (const file of ['identity.locale.json', 'identity.en.locale.json']) {
      const locale = JSON.parse(await read(`../../src/modules/identity/locales/${file}`)) as {
        users: { editDialog: Record<string, string> }
      }
      expect(locale.users.editDialog.jobTitle).toBeTruthy()
      expect(locale.users.editDialog.jobTitleHint).toBeTruthy()
    }
    const pt = JSON.parse(
      await read('../../src/modules/identity/locales/identity.locale.json'),
    ) as {
      users: { editDialog: Record<string, string> }
    }
    expect(pt.users.editDialog.jobTitleHint).toContain('assinatura dos e-mails de ocorrência')
  })

  test('o diálogo usa o campo e a tabela mostra o cargo abaixo do nome', async () => {
    const dialog = await read(
      '../../src/modules/identity/components/CompanyUserEditDialog.component.tsx',
    )
    const table = await read('../../src/modules/identity/components/CompanyUserTable.component.tsx')

    expect(dialog).toContain('form.setJobTitle')
    expect(dialog).toContain('JOB_TITLE_MAX_LENGTH')
    expect(table).toContain('user.jobTitle')
  })
})
