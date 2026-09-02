/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { RouteSuggestionController } from '../hooks/useRouteSuggestion.hook'
import styles from '../styles/routing.module.css'
import { RouteSuggestionPanel } from './RouteSuggestionPanel.component'

type RouteSuggestionSectionProps = Readonly<{
  controller: RouteSuggestionController
}>

/**
 * O botão que pede o roteiro, e a proposta quando ela existe. Enquanto o worker resolve, o estado é
 * a própria sugestão em `queued`/`running` — o painel a mostra dizendo o que está acontecendo, em
 * vez de um spinner mudo que não diz se algo está sendo feito ou se travou.
 */
export function RouteSuggestionSection({ controller }: RouteSuggestionSectionProps): JSX.Element {
  const { t } = useTranslation('routing')

  return (
    <section className={styles.section}>
      {controller.suggestion === null ? (
        <div className={styles.invite}>
          <p className={styles.inviteText}>{t('invite.text')}</p>
          <Button
            disabled={controller.isRequesting}
            onClick={() => void controller.request()}
            size="sm"
            type="button"
          >
            <Icon aria-hidden="true" name="link" />
            {controller.isRequesting ? t('invite.requesting') : t('invite.action')}
          </Button>
        </div>
      ) : (
        <RouteSuggestionPanel
          isDeciding={controller.isDeciding}
          onAccept={() => void controller.accept()}
          onRefineAddress={controller.refineAddress}
          onReject={() => void controller.reject()}
          suggestion={controller.suggestion}
        />
      )}

      {/**
       * O erro do pedido é separado do erro da sugestão: um é "não consegui pedir", o outro é "pedi
       * e não deu para resolver". Misturá-los esconderia qual dos dois aconteceu.
       */}
      {controller.errorCode === null ? null : (
        <p className={styles.requestError} role="alert">
          {t(`failure.${controller.errorCode}`, { defaultValue: t('failure.unknown') })}
        </p>
      )}
    </section>
  )
}
