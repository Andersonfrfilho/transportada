/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import {
  OCCURRENCE_ITEMS_MODE,
  type OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import {
  hasOccurrenceMailProblems,
  insertOccurrenceMailMarker,
  isOccurrenceMailDraftChanged,
  OCCURRENCE_MAIL_DRAFT_KEY,
  readOccurrenceMailProblems,
  type OccurrenceMailDraft,
} from '@/modules/trip/shared/occurrenceMailDraft.service'
import {
  OCCURRENCE_MAIL_CONTEXT,
  OCCURRENCE_MAIL_MAX_LENGTH,
  type OccurrenceMailContext,
} from '@/modules/trip/shared/occurrenceMailTemplate.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import itemStyles from '@/modules/trip/styles/occurrenceTypeItem.module.css'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

import {
  OccurrenceTypeMailFields,
  type OccurrenceMailFieldElement,
} from './OccurrenceTypeMailFields.component'
import { OccurrenceTypeMailMarkers } from './OccurrenceTypeMailMarkers.component'
import { OccurrenceTypeMailPreview } from './OccurrenceTypeMailPreview.component'

type OccurrenceTypeContractorMailProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

type PendingCaret = Readonly<{ caret: number; context: OccurrenceMailContext }>

/**
 * Spec 247 RF3/RF4/RF5: o e-mail que a contratante da nota recebe ao registrar. O interruptor grava na hora;
 * os três textos são **rascunho** (como os momentos): nada grava a cada tecla, a prévia do servidor acompanha
 * o rascunho com `debounce`, e o "Salvar e-mail" manda os três de uma vez.
 */
export function OccurrenceTypeContractorMail({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeContractorMailProps) {
  const { t } = useTranslation('companySettings')
  const [draft, setDraft] = useState<null | OccurrenceMailDraft>(null)
  const [activeContext, setActiveContext] = useState<OccurrenceMailContext>(
    OCCURRENCE_MAIL_CONTEXT.body,
  )
  const fieldRefs = useRef<
    Partial<Record<OccurrenceMailContext, null | OccurrenceMailFieldElement>>
  >({})
  const pendingCaret = useRef<null | PendingCaret>(null)

  const saved: OccurrenceMailDraft = {
    emailBody: type.emailBody,
    emailItemLineTemplate: type.emailItemLineTemplate ?? '',
    emailSubject: type.emailSubject,
  }
  const pending = draft !== null && isOccurrenceMailDraftChanged(draft, saved) ? draft : null
  const shown = pending ?? saved
  const problems = readOccurrenceMailProblems(shown)
  const isBlocked = hasOccurrenceMailProblems(problems)

  /** O cursor volta ao campo logo depois do marcador inserido: a lista de marcadores tirou o foco dele. */
  useEffect(() => {
    const caretRequest = pendingCaret.current
    if (caretRequest === null) return
    pendingCaret.current = null
    const element = fieldRefs.current[caretRequest.context]
    element?.focus()
    element?.setSelectionRange(caretRequest.caret, caretRequest.caret)
  }, [draft])

  function handleChange(context: OccurrenceMailContext, text: string) {
    setDraft({ ...shown, [OCCURRENCE_MAIL_DRAFT_KEY[context]]: text })
  }

  function handlePickMarker(marker: string) {
    const element = fieldRefs.current[activeContext]
    const text = shown[OCCURRENCE_MAIL_DRAFT_KEY[activeContext]]
    const start = element?.selectionStart ?? text.length
    const end = element?.selectionEnd ?? start
    const next = insertOccurrenceMailMarker({ end, marker, start, text })
    if (next.text.length > OCCURRENCE_MAIL_MAX_LENGTH[activeContext]) return
    pendingCaret.current = { caret: next.caret, context: activeContext }
    handleChange(activeContext, next.text)
  }

  function handleSave() {
    if (pending === null || isBlocked) return
    onEdit(pending)
  }

  return (
    <section aria-label={t('occurrenceTypeCatalog.mail.title')} className={styles.mail}>
      <p className={itemStyles.blockTitle}>{t('occurrenceTypeCatalog.mail.title')}</p>
      <Checkbox
        checked={type.emailsContractor === true}
        disabled={disabled}
        label={t('occurrenceTypeCatalog.mail.switch')}
        onChange={(value) => onEdit({ emailsContractor: value })}
      />
      <div className={styles.layout}>
        <div className={styles.fields}>
          <OccurrenceTypeMailFields
            disabled={disabled}
            draft={shown}
            fieldRefs={fieldRefs}
            onChange={handleChange}
            onFocus={setActiveContext}
            problems={problems}
          />
          <OccurrenceTypeMailMarkers
            context={activeContext}
            disabled={disabled}
            onPick={handlePickMarker}
          />
          <div className={styles.actions}>
            <Button
              className={styles.action}
              disabled={disabled || pending === null || isBlocked}
              onClick={handleSave}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {t('occurrenceTypeCatalog.mail.save')}
            </Button>
            {pending === null ? null : (
              <Button
                className={styles.action}
                onClick={() => setDraft(null)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="close" />
                {t('occurrenceTypeCatalog.mail.undo')}
              </Button>
            )}
          </div>
        </div>
        <OccurrenceTypeMailPreview
          draft={shown}
          hasItems={type.itemsMode !== OCCURRENCE_ITEMS_MODE.off}
          isAutomatic={type.emailsContractor === true}
          problems={problems}
        />
      </div>
    </section>
  )
}
