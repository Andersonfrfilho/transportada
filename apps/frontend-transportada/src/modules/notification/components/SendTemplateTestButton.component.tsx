import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/notification.module.css'

type SendTemplateTestButtonProps = Readonly<{
  onSend: (templateKey: string) => Promise<void>
  templateKey: string
}>

type TestState = 'failed' | 'idle' | 'sending' | 'sent'

/** O aviso volta a sumir sozinho: mensagem fixa na tela vira parte do layout e para de ser lida. */
const FEEDBACK_MS = 6000

/**
 * "Enviar teste" no cabeçalho do editor.
 *
 * O rótulo diz **para mim** de propósito: um botão que só diz "Enviar", numa tela de template,
 * sugere disparar para a base inteira — e essa dúvida trava a mão de quem opera. A rota não aceita
 * destinatário, e o texto do botão conta isso antes do clique, não depois.
 */
export function SendTemplateTestButton({ onSend, templateKey }: SendTemplateTestButtonProps) {
  const { t } = useTranslation('notification')
  const [state, setState] = useState<TestState>('idle')

  function handleClick(): void {
    setState('sending')
    onSend(templateKey)
      .then(() => setState('sent'))
      .catch(() => setState('failed'))
      .finally(() => {
        window.setTimeout(() => setState('idle'), FEEDBACK_MS)
      })
  }

  return (
    <span className={styles.notificationTestAction}>
      <Button disabled={state === 'sending'} onClick={handleClick} size="sm" type="button">
        <Icon name="send" />
        {state === 'sending' ? t('test.sending') : t('test.send')}
      </Button>
      {state === 'idle' || state === 'sending' ? null : (
        <span
          className={state === 'sent' ? styles.notificationTestOk : styles.notificationTestFailed}
          role="status"
        >
          {state === 'sent' ? t('test.sent') : t('test.failed')}
        </span>
      )}
    </span>
  )
}
