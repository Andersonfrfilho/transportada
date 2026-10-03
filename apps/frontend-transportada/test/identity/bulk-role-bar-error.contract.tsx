/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { CompanyUserBulkRoleBar } from '@/modules/identity/components/CompanyUserBulkRoleBar.component'
import ptLocale from '@/modules/identity/locales/identity.locale.json'
import type { CompanyUser } from '@/modules/identity/shared/companyUsers.types'

const NOOP = (): void => undefined

const SELECTED: CompanyUser = {
  contact: { channel: 'email', masked: 'a***@example.test' },
  email: 'a***@example.test',
  emails: ['a***@example.test'],
  hasPicture: false,
  id: 'user-1',
  membershipId: 'membership-1',
  name: 'Pessoa Alvo',
  phone: '',
  roles: ['operator'],
  status: 'active',
  taxId: '',
  username: 'pessoa.alvo',
}

function renderBar(errorCode?: string): string {
  return renderToStaticMarkup(
    <CompanyUserBulkRoleBar
      groups={[]}
      onApply={NOOP}
      onApplyGroups={NOOP}
      onClearSelection={NOOP}
      onUnselect={NOOP}
      roleChoices={['operator']}
      selectedUsers={[SELECTED]}
      {...(errorCode === undefined ? {} : { errorCode })}
    />,
  )
}

describe('barra de papéis em lote mostra a falha da atribuição (spec 239 A3)', () => {
  test('com código conhecido, o alerta traz a mensagem do código', () => {
    const html = renderBar('COMPANY_USER_NOT_FOUND')

    expect(html).toContain('role="alert"')
    expect(html).toContain(ptLocale.users.errors.COMPANY_USER_NOT_FOUND)
  })

  test('com código desconhecido, o alerta traz a mensagem padrão', () => {
    const html = renderBar('CODIGO_QUE_NAO_EXISTE')

    expect(html).toContain('role="alert"')
    expect(html).toContain(ptLocale.users.errors.default)
  })

  test('sem erro, não há alerta', () => {
    expect(renderBar()).not.toContain('role="alert"')
  })
})
