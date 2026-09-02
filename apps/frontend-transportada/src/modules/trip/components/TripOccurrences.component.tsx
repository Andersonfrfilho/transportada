/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

import { separationOccurrenceTypes } from '../shared/occurrence.constant'
import type { TripOccurrence } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripOccurrencesProps = Readonly<{
  canRegister: boolean
  isRegistering: boolean
  occurrences: readonly TripOccurrence[]
  onRegister: (input: { readonly note: string; readonly type: string }) => void
}>

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Spec 079 T020: o que houve com a carga.
 *
 * ⚠️ **A ocorrência só anota** — não muda o estado da nota, não bloqueia despacho. Misturar os dois
 * eixos deixaria a nota travada num estado que ninguém sabe destravar, porque não existe tela de
 * resolução de ocorrência.
 *
 * ⚠️ A tela do escritório oferece **só os tipos de separação**. A ocorrência de rua é `trip.report`
 * e mora na árvore do motorista; oferecê-la aqui produziria um botão que sempre responde 403 —
 * pior que não existir, porque parece capaz.
 */
export function TripOccurrences({
  canRegister,
  isRegistering,
  occurrences,
  onRegister,
}: TripOccurrencesProps) {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState(separationOccurrenceTypes()[0] ?? '')
  const [note, setNote] = useState('')

  function handleSubmit() {
    onRegister({ note, type })
    setNote('')
    setIsOpen(false)
  }

  return (
    <>
      <h4 className={styles.hint}>{t('occurrence.title')}</h4>
      {occurrences.length === 0 ? (
        <p className={styles.hint}>{t('occurrence.none')}</p>
      ) : (
        <ul className={styles.documentProductList}>
          {occurrences.map((occurrence) => (
            <li key={occurrence.id}>
              {t('occurrence.line', {
                moment: momentFormatter.format(new Date(occurrence.createdAt)),
                type: t(`occurrence.type.${occurrence.type}`),
              })}
              {occurrence.note === '' ? null : ` — ${occurrence.note}`}
            </li>
          ))}
        </ul>
      )}
      {canRegister && !isOpen ? (
        <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="ghost">
          {t('occurrence.register')}
        </Button>
      ) : null}
      {canRegister && isOpen ? (
        <div className={styles.occurrenceForm}>
          <Select
            ariaLabel={t('occurrence.title')}
            onChange={setType}
            options={separationOccurrenceTypes().map((option) => ({
              label: t(`occurrence.type.${option}`),
              value: option,
            }))}
            value={type}
          />
          <input
            aria-label={t('occurrence.noteLabel')}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('occurrence.noteLabel')}
            type="text"
            value={note}
          />
          <Button disabled={isRegistering} onClick={handleSubmit} size="sm" type="button">
            {t('occurrence.submit')}
          </Button>
          <Button onClick={() => setIsOpen(false)} size="sm" type="button" variant="ghost">
            {t('occurrence.cancel')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
