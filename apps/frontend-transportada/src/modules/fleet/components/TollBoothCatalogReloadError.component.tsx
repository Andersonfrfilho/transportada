/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503 (revisão final, defeito 1): a frase de erro da recarga do catálogo era duplicada
 * em `TollBoothCatalogReloadPanel` e `TollBoothCatalogReloadDialog`, e as duas cópias esqueciam de
 * passar `{ code: errorCode }` — a frase default (`errors.default`, "Código: {{code}}.") ficava
 * com o literal `{{code}}` em vez do código real quando o backend responde um código sem frase
 * própria (ex.: `STORAGE_UNAVAILABLE`, 503 de storage indisponível). Extraído para um único lugar,
 * testável isolado por renderização.
 */
import { useTranslation } from 'react-i18next'

import styles from '../styles/fleet.module.css'

export type TollBoothCatalogReloadErrorProps = Readonly<{ errorCode: string }>

export function TollBoothCatalogReloadError({ errorCode }: TollBoothCatalogReloadErrorProps) {
  const { t } = useTranslation('fleet')

  return (
    <p className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
      {t(`tollBoothCharges.reload.errors.${errorCode}`, {
        code: errorCode,
        defaultValue: t('tollBoothCharges.reload.errors.default', { code: errorCode }),
      })}
    </p>
  )
}
