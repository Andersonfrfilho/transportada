/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { OccurrenceMissingField } from '../shared/occurrenceRequirements.service'
import styles from '../styles/driverTrip.module.css'

type OccurrenceRegisterActionProps = Readonly<{
  canRegister: boolean
  /** O que falta, na ordem em que o formulário pergunta — vira o motivo do botão desabilitado. */
  missingFields: readonly OccurrenceMissingField[]
  onCancel: () => void
  onRegister: () => void
  photoMinimumCount: number
  /** O formulário sem tipo escolhido ainda não tem o que registrar: só o "Cancelar". */
  rendersRegister: boolean
}>

/**
 * Spec 246 (RF7): o "Registrar" desabilitado **diz por quê** — o motivo é texto à vista, ligado ao
 * botão por `aria-describedby`, e nunca uma recusa depois do toque.
 */
export function OccurrenceRegisterAction({
  canRegister,
  missingFields,
  onCancel,
  onRegister,
  photoMinimumCount,
  rendersRegister,
}: OccurrenceRegisterActionProps) {
  const { t } = useTranslation('driverTrip')
  const missingId = useId()
  const hasMissing = missingFields.length > 0

  return (
    <>
      {hasMissing ? (
        <p className={styles.notDeliveredMissing} id={missingId} role="status">
          {t('occurrenceRegistration.missingLead', {
            fields: missingFields
              .map((field) =>
                t(`occurrenceRegistration.missing.${field}`, { count: photoMinimumCount }),
              )
              .join(', '),
          })}
        </p>
      ) : null}
      <div className={styles.actions}>
        {rendersRegister ? (
          <Button
            aria-describedby={hasMissing ? missingId : undefined}
            disabled={!canRegister}
            onClick={onRegister}
            type="button"
          >
            <Icon name="save" />
            {t('occurrenceSend')}
          </Button>
        ) : null}
        <Button onClick={onCancel} type="button" variant="ghost">
          {t('occurrenceRegistration.cancel')}
        </Button>
      </div>
    </>
  )
}
