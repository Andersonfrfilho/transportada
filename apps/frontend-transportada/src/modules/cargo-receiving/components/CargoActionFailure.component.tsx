/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX, RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import type { RegistrationRefusal } from '../shared/cargoReceivingRefusal.service'
import styles from '../styles/cargoReceiving.module.css'
import { RegistrationRefusalSummary } from './RegistrationRefusalSummary.component'

type CargoActionFailureProps = Readonly<{
  errorCode: string | undefined
  panelRef: RefObject<HTMLElement | null>
  refusal: RegistrationRefusal | undefined
}>

/**
 * A recusa do servidor ao aplicar rota ou marcar em lote, no padrão do fechamento: o aviso traduzido e,
 * quando o servidor aponta notas ou campos, todos de uma vez, cada um com atalho.
 */
export function CargoActionFailure({
  errorCode,
  panelRef,
  refusal,
}: CargoActionFailureProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (errorCode === undefined) return null

  return (
    <section data-action-failure="">
      <p className={styles.error} role="alert">
        {t([`errors.${errorCode}`, 'errors.unknown'], { code: errorCode })}
      </p>
      {refusal === undefined ? null : (
        <RegistrationRefusalSummary panelRef={panelRef} refusal={refusal} />
      )}
    </section>
  )
}
