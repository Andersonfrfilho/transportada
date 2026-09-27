/* Cópia por valor de apps/frontend-client/src/modules/shared/LoginIdentifier.page.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { InstallationBrandMark } from '@/modules/identity/components/InstallationBrandMark.component'
import { useInstallationBrandView } from '@/modules/identity/hooks/useInstallationBrandView.hook'

import { getKeycloakAuthProvider } from './KeycloakAuthProvider.provider'
import { resolveLoginHint } from './loginHintClient.service'

/**
 * Cópia por valor de `LoginIdentifier.page.tsx` do portal. O provedor encontra alguém por
 * `username` ou pelo campo `email`, e só — documento e telefone ele não sabe procurar de jeito
 * nenhum. Aqui a pessoa digita o que lembra, nós resolvemos **quem é**, e o provedor recebe o
 * login que ele conhece.
 *
 * A senha não passa por esta tela nem por esta aplicação: ela continua sendo digitada no Keycloak,
 * no fluxo de browser com PKCE. O que muda é só o campo já chegar preenchido do outro lado.
 */
export function LoginIdentifierPage() {
  const { t } = useTranslation('identity')
  const [identifier, setIdentifier] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const brand = useInstallationBrandView()

  async function submit(): Promise<void> {
    const typed = identifier.trim()
    if (typed === '' || isSubmitting) return

    setSubmitting(true)
    /**
     * A resolução é conveniência, nunca porteiro: se a API não responder, seguimos com o que a
     * pessoa digitou. Barrar a entrada porque uma consulta de conforto falhou seria trocar um
     * atalho por um bloqueio.
     */
    const loginHint = await resolveLoginHint(typed).catch(() => typed)
    await getKeycloakAuthProvider().loginWith(loginHint)
  }

  return (
    <main className="page login">
      <form
        className="panel login__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="login__brand">
          <InstallationBrandMark
            brand={brand}
            logoClassName="login__logo"
            nameClassName="login__name"
          />
        </div>
        <h1 className="page__title login__title">{t('login.title')}</h1>
        <p className="page__subtitle login__subtitle">{t('login.subtitle')}</p>

        <label className="panel__label login__label" htmlFor="login-identifier">
          {t('login.identifierLabel')}
        </label>
        <input
          autoComplete="username"
          autoFocus
          className="panel__input login__input"
          id="login-identifier"
          onChange={(event) => setIdentifier(event.target.value)}
          type="text"
          value={identifier}
        />
        <p className="login__hint">{t('login.identifierHint')}</p>

        <Button
          className="login__submit"
          disabled={identifier.trim() === '' || isSubmitting}
          type="submit"
        >
          <Icon aria-hidden="true" name="login" />
          {isSubmitting ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>
    </main>
  )
}
