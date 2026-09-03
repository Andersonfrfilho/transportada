/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

import { TRIP_OCCURRENCE_STAGE } from '../shared/occurrence.constant'
import type { OccurrenceType } from '../shared/occurrence.constant'
import type { TripDocumentProduct, TripOccurrence } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripOccurrencesProps = Readonly<{
  canRegister: boolean
  /** O e-mail que o último registro produziu, para o operador conferir e enviar. */
  email: null | Readonly<{ body: string; subject: string }>
  isRegistering: boolean
  occurrences: readonly TripOccurrence[]
  onRegister: (input: {
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
  }) => void
  products: readonly TripDocumentProduct[]
  types: readonly OccurrenceType[]
}>

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Spec 079: o que houve com a carga.
 *
 * ⚠️ **A ocorrência só anota** — não muda o estado da nota, não bloqueia despacho. Misturar os dois
 * eixos deixaria a nota travada num estado que ninguém sabe destravar.
 *
 * ⚠️ **A tela oferece só os tipos de galpão**, e ativos: a ocorrência de rua é `trip.report` e mora
 * na árvore do motorista; oferecê-la aqui produziria um botão que sempre responde 403. Tipo
 * aposentado sai da lista de escolha, mas o que já foi registrado com ele continua legível.
 *
 * ⚠️ **O item é opcional, e "a nota inteira" é o padrão**: recusa total não tem item a apontar, e
 * obrigar a escolher faria quem registra escolher qualquer um.
 */
export function TripOccurrences({
  canRegister,
  email,
  isRegistering,
  occurrences,
  onRegister,
  products,
  types,
}: TripOccurrencesProps) {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  const disponiveis = types.filter(
    (type) => type.active && type.stage === TRIP_OCCURRENCE_STAGE.separation,
  )
  const [occurrenceTypeId, setOccurrenceTypeId] = useState(disponiveis[0]?.id ?? '')
  const [productCode, setProductCode] = useState('')
  const [note, setNote] = useState('')

  function handleSubmit() {
    if (occurrenceTypeId === '') return
    onRegister({ note, occurrenceTypeId, productCode })
    setNote('')
    setProductCode('')
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
                type: occurrence.typeName,
              })}
              {occurrence.productCode === ''
                ? ` — ${t('occurrence.wholeDocument')}`
                : ` — ${occurrence.productCode}`}
              {occurrence.note === '' ? null : ` — ${occurrence.note}`}
            </li>
          ))}
        </ul>
      )}
      {/*
       * ⚠️ O e-mail volta **pronto para conferir e enviar**, não enviado: o destinatário é externo,
       * e mandar em nome da transportadora é decisão que ainda não foi tomada. O que isto resolve é
       * o retrabalho de escrever à mão — que é onde o número da nota entra trocado.
       */}
      {email === null ? null : (
        <div className={styles.occurrenceForm}>
          <p className={styles.hint}>{t('occurrence.emailReady')}</p>
          <strong>{email.subject}</strong>
          <pre className={styles.occurrenceEmail}>{email.body}</pre>
        </div>
      )}
      {canRegister && disponiveis.length > 0 && !isOpen ? (
        <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="ghost">
          <Icon name="alert" />
          {t('occurrence.register')}
        </Button>
      ) : null}
      {canRegister && isOpen ? (
        <div className={styles.occurrenceForm}>
          <Select
            ariaLabel={t('occurrence.title')}
            onChange={setOccurrenceTypeId}
            options={disponiveis.map((type) => ({ label: type.name, value: type.id }))}
            value={occurrenceTypeId}
          />
          <Select
            ariaLabel={t('occurrence.product')}
            onChange={setProductCode}
            options={[
              { label: t('occurrence.wholeDocument'), value: '' },
              ...products.map((product) => ({
                label: `${product.code} — ${product.description}`,
                value: product.code,
              })),
            ]}
            value={productCode}
          />
          <input
            aria-label={t('occurrence.noteLabel')}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('occurrence.noteLabel')}
            type="text"
            value={note}
          />
          <Button disabled={isRegistering} onClick={handleSubmit} size="sm" type="button">
            <Icon name="save" />
            {t('occurrence.submit')}
          </Button>
          <Button onClick={() => setIsOpen(false)} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('occurrence.cancel')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
