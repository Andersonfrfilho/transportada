/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/identity.module.css'

export type NoWorkspaceAccessProps = Readonly<{
  onSignOut: () => void
}>

/**
 * Spec 221 RF-C5: conta sem nenhuma área do painel caía no NF-e emparedado, sem nem um caminho para
 * o logout no corpo da tela — o botão de sair vive no cabeçalho, que ali não ajuda quem não entende
 * por que a tela está vazia. Esta é tela de beco: diz o que aconteceu, a quem pedir, e oferece a
 * única ação que faz sentido.
 */
export function NoWorkspaceAccess({ onSignOut }: NoWorkspaceAccessProps) {
  const { t } = useTranslation('identity')

  return (
    <main className={styles.noAccessShell}>
      <section className={styles.noAccessPanel} role="alert">
        <Icon aria-hidden="true" name="alert" />
        <h1 className={styles.noAccessTitle}>{t('noWorkspaceAccess.title')}</h1>
        <p className={styles.noAccessBody}>{t('noWorkspaceAccess.body')}</p>
        <p className={styles.noAccessHint}>{t('noWorkspaceAccess.askAdmin')}</p>
        <Button onClick={onSignOut} type="button" variant="secondary">
          <Icon name="power" />
          {t('noWorkspaceAccess.signOut')}
        </Button>
      </section>
    </main>
  )
}
