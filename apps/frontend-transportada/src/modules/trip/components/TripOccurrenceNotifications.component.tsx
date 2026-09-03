/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'

import {
  OCCURRENCE_TEMPLATE_PLACEHOLDERS,
  TRIP_OCCURRENCE_STAGE,
} from '../shared/occurrence.constant'
import type { OccurrenceType, TripOccurrenceStage } from '../shared/occurrence.constant'
import {
  buildOccurrenceEmailTemplateOptions,
  findUnknownTemplatePlaceholders,
  OCCURRENCE_TEMPLATE_FROM_SCRATCH,
} from '../shared/occurrenceTemplate.service'
import { useEmailTemplatesQuery } from '@/modules/notification/queries/useEmailTemplates.query'
import styles from '../styles/trip.module.css'

type TripOccurrenceTypesProps = Readonly<{
  canManage: boolean
  isSaving: boolean
  onSave: (input: {
    readonly active: boolean
    readonly emailBody: string
    readonly emailSubject: string
    readonly name: string
    readonly notifies: boolean
    readonly occurrenceTypeId: null | string
    readonly stage: TripOccurrenceStage
  }) => void
  types: readonly OccurrenceType[]
}>

/**
 * Spec 079: os tipos de ocorrência que a empresa cadastra.
 *
 * ⚠️ **O grupo é escolhido no cadastro**, e não é enfeite: `separation` é do galpão (`trip.manage`)
 * e `delivery` é da rua (`trip.report`). É ele que decide quem registra, e por isso o campo é
 * obrigatório — um padrão escondido daria permissão por omissão.
 *
 * ⚠️ **O padrão é não avisar.** Aviso que ninguém pediu vira ruído, e ruído faz o operador ignorar
 * também o que importa.
 */
export function TripOccurrenceNotifications({
  canManage,
  isSaving,
  onSave,
  types,
}: TripOccurrenceTypesProps) {
  const { t } = useTranslation('trip')
  const [name, setName] = useState('')
  const [stage, setStage] = useState<TripOccurrenceStage>(TRIP_OCCURRENCE_STAGE.separation)
  const [notifies, setNotifies] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailTemplateId, setEmailTemplateId] = useState<string>(OCCURRENCE_TEMPLATE_FROM_SCRATCH)

  const emailTemplates = useEmailTemplatesQuery({ enabled: canManage })
  const templateOptions = buildOccurrenceEmailTemplateOptions(emailTemplates.data ?? [])
  const unknownPlaceholders = findUnknownTemplatePlaceholders(`${emailSubject}\n${emailBody}`)

  function handleTemplateChange(value: string) {
    setEmailTemplateId(value)
    const chosen = templateOptions.find((option) => option.id === value)
    if (chosen === undefined) return
    setEmailSubject(chosen.subject)
    setEmailBody(chosen.body)
  }

  function handleAdd() {
    if (name.trim() === '') return
    onSave({ active: true, emailBody, emailSubject, name, notifies, occurrenceTypeId: null, stage })
    setName('')
    setNotifies(false)
    setEmailSubject('')
    setEmailBody('')
    setEmailTemplateId(OCCURRENCE_TEMPLATE_FROM_SCRATCH)
  }

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('occurrence.notificationsTitle')}</h3>
      <p className={styles.hint}>{t('occurrence.notificationsHint')}</p>

      {types.length === 0 ? <p className={styles.hint}>{t('occurrence.empty')}</p> : null}

      {[TRIP_OCCURRENCE_STAGE.separation, TRIP_OCCURRENCE_STAGE.delivery].map((group) => {
        const doGrupo = types.filter((type) => type.stage === group)
        if (doGrupo.length === 0) return null

        return (
          <fieldset className={styles.occurrenceStage} key={group}>
            <legend className={styles.hint}>
              {group === TRIP_OCCURRENCE_STAGE.separation
                ? t('occurrence.stageSeparation')
                : t('occurrence.stageDelivery')}
            </legend>
            {doGrupo.map((type) => (
              <div className={styles.occurrenceForm} key={type.id}>
                <span>{type.name}</span>
                {type.emailSubject === '' ? (
                  <span className={styles.hint}>{t('occurrence.withoutTemplate')}</span>
                ) : (
                  <span className={styles.hint}>{type.emailSubject}</span>
                )}
                <Checkbox
                  checked={type.notifies}
                  disabled={!canManage || isSaving}
                  label={t('occurrence.notifies')}
                  onChange={(value) =>
                    onSave({
                      active: type.active,
                      /*
                       * ⚠️ O template viaja junto: o `PUT` grava o tipo inteiro, e omiti-lo aqui
                       * apagaria o texto do e-mail ao marcar uma caixa de seleção.
                       */
                      emailBody: type.emailBody,
                      emailSubject: type.emailSubject,
                      name: type.name,
                      notifies: value,
                      occurrenceTypeId: type.id,
                      stage: type.stage,
                    })
                  }
                />
                {/* Aposentar não apaga: ocorrência já registrada continua com o nome sob o qual foi. */}
                <Checkbox
                  checked={type.active}
                  disabled={!canManage || isSaving}
                  label={t('occurrence.active')}
                  onChange={(value) =>
                    onSave({
                      active: value,
                      emailBody: type.emailBody,
                      emailSubject: type.emailSubject,
                      name: type.name,
                      notifies: type.notifies,
                      occurrenceTypeId: type.id,
                      stage: type.stage,
                    })
                  }
                />
              </div>
            ))}
          </fieldset>
        )
      })}

      {canManage ? (
        <div className={styles.occurrenceForm}>
          <input
            aria-label={t('occurrence.name')}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('occurrence.name')}
            type="text"
            value={name}
          />
          <Select
            ariaLabel={t('occurrence.stage')}
            onChange={(value) => setStage(value as TripOccurrenceStage)}
            options={[
              { label: t('occurrence.stageSeparation'), value: TRIP_OCCURRENCE_STAGE.separation },
              { label: t('occurrence.stageDelivery'), value: TRIP_OCCURRENCE_STAGE.delivery },
            ]}
            value={stage}
          />
          <Checkbox checked={notifies} label={t('occurrence.notifies')} onChange={setNotifies} />
          <Select
            ariaLabel={t('occurrence.emailTemplate')}
            onChange={handleTemplateChange}
            options={[
              {
                label: t('occurrence.emailTemplateFromScratch'),
                value: OCCURRENCE_TEMPLATE_FROM_SCRATCH,
              },
              ...templateOptions.map((option) => ({ label: option.label, value: option.id })),
            ]}
            value={emailTemplateId}
          />
          <input
            aria-label={t('occurrence.emailSubject')}
            onChange={(event) => setEmailSubject(event.target.value)}
            placeholder={t('occurrence.emailSubject')}
            type="text"
            value={emailSubject}
          />
          <textarea
            aria-label={t('occurrence.emailBody')}
            onChange={(event) => setEmailBody(event.target.value)}
            placeholder={t('occurrence.emailBody')}
            rows={4}
            value={emailBody}
          />
          {/*
           * A lista de marcadores fica **ao lado do campo**, não numa ajuda escondida: quem escreve
           * o modelo precisa dela enquanto escreve, e marcador fora dela é recusado ao salvar.
           */}
          {unknownPlaceholders.length > 0 ? (
            <p className={styles.hint} role="alert">
              {t('occurrence.unknownPlaceholders', {
                list: unknownPlaceholders.map((name) => `{{${name}}}`).join(', '),
              })}
            </p>
          ) : null}
          <p className={styles.hint}>
            {t('occurrence.placeholders', {
              list: OCCURRENCE_TEMPLATE_PLACEHOLDERS.map((name) => `{{${name}}}`).join(', '),
            })}
          </p>
          <Button disabled={isSaving} onClick={handleAdd} size="sm" type="button">
            <Icon name="add" />
            {t('occurrence.add')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
