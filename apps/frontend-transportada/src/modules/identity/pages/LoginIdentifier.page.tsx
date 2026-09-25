/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { ApplicationFooter } from '@/modules/foundation/components/ApplicationFooter.component'

import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '../shared/KeycloakAuthProvider.provider'
import { readInstallationBrand, type InstallationBrand } from '../shared/installationBrand.service'
import {
  mergeInstallationBrand,
  readCachedInstallationBrand,
  writeCachedInstallationBrand,
} from '../shared/installationBrandCache.service'
import { resolveLoginHint } from '../shared/loginHintClient.service'
import {
  readRememberedLoginIdentifier,
  rememberLoginIdentifier,
} from '../shared/loginIdentifierMemory.service'
import styles from '../styles/loginIdentifier.module.css'

/**
 * A primeira etapa do login. O provedor encontra alguém por `username` ou pelo campo `email`, e
 * só — documento e telefone ele não sabe procurar de jeito nenhum. Aqui a pessoa digita o que
 * lembra, nós resolvemos **quem é**, e o provedor recebe o login que ele conhece.
 *
 * A senha não passa por esta tela nem por esta aplicação: ela continua sendo digitada no Keycloak,
 * no fluxo de browser com PKCE. O que muda é só o campo já chegar preenchido do outro lado.
 */
export function LoginIdentifierPage() {
  const { t } = useTranslation('identity')
  /** Quem voltou pelo "Trocar de usuário" encontra o que digitou, para corrigir em vez de redigitar. */
  const [identifier, setIdentifier] = useState(readRememberedLoginIdentifier)
  const [isSubmitting, setSubmitting] = useState(false)
  /** A marca da última visita é o primeiro quadro: sem ela, a tela nascia com o produto e trocava. */
  const [brand, setBrand] = useState<InstallationBrand | undefined>(readCachedInstallationBrand)
  /** Instalação sem logotipo configurado, ou API fora do ar: a marca do produto assume. */
  const [hasLogo, setHasLogo] = useState(true)

  useEffect(() => {
    let active = true
    void readInstallationBrand({
      apiUrl: getIdentityEnvironment().apiBaseUrl,
      fetch: globalThis.fetch.bind(globalThis),
    }).then((fetched) => {
      const resolved = mergeInstallationBrand({ cached: readCachedInstallationBrand(), fetched })
      writeCachedInstallationBrand(resolved)
      if (active) setBrand(resolved)
    })
    return () => {
      active = false
    }
  }, [])

  async function submit(): Promise<void> {
    const typed = identifier.trim()
    if (typed === '' || isSubmitting) return

    setSubmitting(true)
    rememberLoginIdentifier(typed)
    /**
     * A resolução é conveniência, nunca porteiro: se a API não responder, seguimos com o que a
     * pessoa digitou. Barrar a entrada porque uma consulta de conforto falhou seria trocar um
     * atalho por um bloqueio.
     */
    const loginHint = await resolveLoginHint(typed).catch(() => typed)
    await getKeycloakAuthProvider().loginWith(loginHint)
  }

  return (
    <main className={styles.shell}>
      <form
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {/*
          A marca antes do título: quem chega aqui vindo de um link precisa reconhecer onde está
          antes de digitar o próprio documento. O ícone é o mesmo do app instalado.
        */}
        <div className={styles.brand}>
          {/* Primeira visita, marca ainda a caminho: a forma dela, nunca o produto que depois troca. */}
          {brand === undefined ? (
            <Skeleton height="4.5rem" width="var(--space-16)" />
          ) : (
            <>
              <img
                alt=""
                aria-hidden="true"
                className={styles.brandMark}
                /** O `onError` cobre o 404 da instalação sem logotipo e a imagem que não carrega. */
                onError={() => setHasLogo(false)}
                src={hasLogo ? brand.logoUrl : '/icons/icon.svg'}
              />
              <strong className={styles.brandName}>{brand.name ?? 'TransportAdA'}</strong>
            </>
          )}
        </div>

        <h1 className={styles.title}>{t('login.title')}</h1>
        <p className={styles.intro}>{t('login.intro')}</p>

        <label className={styles.field}>
          <span>{t('login.label')}</span>
          <input
            autoComplete="username"
            autoFocus
            onChange={(event) => setIdentifier(event.target.value)}
            /** Selecionado, o valor lembrado some ao primeiro caractere de quem vai digitar outro. */
            onFocus={(event) => event.currentTarget.select()}
            type="text"
            value={identifier}
          />
          {/* Dizer o que serve evita a pessoa achar que só o login canônico entra. */}
          <span className={styles.hint}>{t('login.hint')}</span>
        </label>

        <Button disabled={identifier.trim() === '' || isSubmitting} type="submit">
          <Icon name="send" />
          {isSubmitting ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>

      {/*
        O mesmo rodapé do resto do produto: quem assina o software é o mesmo antes e depois do
        login, e uma tela pública sem autoria é a única do app que não diz de quem ela é.
      */}
      <ApplicationFooter />
    </main>
  )
}
