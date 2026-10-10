/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/ui/copy-button'

import styles from '../styles/subjectConversation.module.css'

/** Spec 263 D8: o protocolo para citar a conversa por telefone; tocar copia, com aviso acessível. */
export function SubjectConversationProtocol({ protocol }: Readonly<{ protocol: string }>) {
  const { t } = useTranslation('subjectConversation')
  return (
    <span className={styles.protocol}>
      <span className={styles.protocolLabel}>{t('protocol.label')}</span>
      <code>{protocol}</code>
      <CopyButton copiedLabel={t('protocol.copied')} label={t('protocol.copy')} value={protocol} />
    </span>
  )
}
