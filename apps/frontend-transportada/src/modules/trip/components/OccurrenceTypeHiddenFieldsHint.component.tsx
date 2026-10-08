/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import styles from '@/modules/trip/styles/occurrenceTypeIdentity.module.css'

type OccurrenceTypeHiddenFieldsHintProps = Readonly<{
  /** "Aceita vários itens" e a reentrega ficam escondidos com Produtos Desligado. */
  isItemsOff: boolean
  /** "A viagem segue sem a nota" só existe em tipo do galpão; o CHECK do banco recusa na rua. */
  isSeparationOnlyHidden: boolean
}>

/** O campo que some sem explicação parece campo perdido: a dica diz o motivo, sem mudar a regra. */
export function OccurrenceTypeHiddenFieldsHint({
  isItemsOff,
  isSeparationOnlyHidden,
}: OccurrenceTypeHiddenFieldsHintProps) {
  const { t } = useTranslation('companySettings')
  if (!isItemsOff && !isSeparationOnlyHidden) return null

  return (
    <div className={styles.hiddenHint}>
      {isItemsOff ? <p>{t('occurrenceTypeCatalog.hiddenFields.itemsOff')}</p> : null}
      {isSeparationOnlyHidden ? (
        <p>{t('occurrenceTypeCatalog.hiddenFields.separationOnly')}</p>
      ) : null}
    </div>
  )
}
