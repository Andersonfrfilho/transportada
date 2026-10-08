/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { OccurrenceMissingField } from '../shared/occurrenceRequirements.service'
import styles from '../styles/driverTrip.module.css'

/** Spec 247: o que o motivo do botão precisa saber além da lista — rótulos do tipo e o mínimo de produtos. */
export type OccurrenceMissingContext = Readonly<{
  declaredAmountLabel: string
  itemsMinimumCount: number
  referenceNumberLabel: string
}>

type OccurrenceRegisterActionProps = Readonly<{
  canRegister: boolean
  /** O tipo exige algo: só então "tudo preenchido" é uma notícia a anunciar. */
  hasRequiredFields?: boolean
  /** O que falta, na ordem em que o formulário pergunta — vira o motivo do botão desabilitado. */
  missingFields: readonly OccurrenceMissingField[]
  onCancel: () => void
  onRegister: () => void
  /** Ausente é o formulário sem produtos, número e valor pago (a parada). */
  missingContext?: OccurrenceMissingContext
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
  hasRequiredFields = false,
  missingContext,
  missingFields,
  onCancel,
  onRegister,
  photoMinimumCount,
  rendersRegister,
}: OccurrenceRegisterActionProps) {
  const { t } = useTranslation('driverTrip')
  const missingId = useId()
  const hasMissing = missingFields.length > 0

  /** `count` é o mínimo de fotos, ou o de produtos; `label` é o rótulo que o tipo deu ao campo. */
  function describeMissingField(field: OccurrenceMissingField): { count: number; label: string } {
    return {
      count:
        field === 'productsMinimum' ? (missingContext?.itemsMinimumCount ?? 1) : photoMinimumCount,
      label:
        field === 'referenceNumber' || field === 'referenceNumberInvalid'
          ? (missingContext?.referenceNumberLabel ?? '')
          : (missingContext?.declaredAmountLabel ?? ''),
    }
  }

  return (
    <>
      {rendersRegister ? (
        <div role="status">
          {hasMissing ? (
            <p className={styles.notDeliveredMissing} id={missingId}>
              {t('occurrenceRegistration.missingLead', {
                fields: missingFields
                  .map((field) =>
                    t(`occurrenceRegistration.missing.${field}`, describeMissingField(field)),
                  )
                  .join(', '),
              })}
            </p>
          ) : null}
          {hasMissing || !hasRequiredFields ? null : (
            <p className={styles.readyToRegister}>{t('occurrenceRegistration.readyToRegister')}</p>
          )}
        </div>
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
