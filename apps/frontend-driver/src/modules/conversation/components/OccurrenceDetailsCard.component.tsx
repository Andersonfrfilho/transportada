/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import styles from '../styles/occurrenceDetails.module.css'

type OccurrenceDetailsCardProps = Readonly<{ onOpen: () => void }>

/**
 * Spec 279 T6c (RF13): o botão "Ver detalhes" logo abaixo do cabeçalho da conversa da ocorrência. O pacote da
 * conversa não tem espaço no cabeçalho para a app hospedeira, mas tem o cartão do assunto (`renderSubjectCard`).
 */
export function OccurrenceDetailsCard({ onOpen }: OccurrenceDetailsCardProps) {
  const { t } = useTranslation('conversation')
  return (
    <div className={styles.card}>
      <button className={styles.cardButton} onClick={onOpen} type="button">
        <Icon name="document" />
        {t('details.open')}
      </button>
    </div>
  )
}
