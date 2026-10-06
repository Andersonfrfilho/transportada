/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'

import {
  OCCURRENCE_ATTACHMENT_MODE,
  OCCURRENCE_ITEMS_MODE,
  OCCURRENCE_REDELIVERY_POLICY,
} from '@/modules/trip/shared/occurrence.constant'
import type {
  OccurrenceAttachmentMode,
  OccurrenceItemsWriteMode,
  OccurrenceMoment,
  OccurrenceRedeliveryPolicy,
} from '@/modules/trip/shared/occurrence.constant'
import { OCCURRENCE_TEMPLATE_NONE } from '@/modules/trip/shared/occurrenceTemplate.service'

export function useOccurrenceTypeCreateDraft(hasItemsModeSupport: boolean) {
  const [name, setName] = useState('')
  /** Nasce no galpão, o grupo que o cadastro sempre ofereceu primeiro; o grupo e o fluxo saem dos momentos. */
  const [moments, setMoments] = useState<readonly OccurrenceMoment[]>(['separation'])
  /** Spec 246 RF3: a observação nasce `optional`, como todo tipo de hoje; a assinatura nasce `off`. */
  const [noteMode, setNoteMode] = useState<OccurrenceAttachmentMode>(
    OCCURRENCE_ATTACHMENT_MODE.optional,
  )
  const [signatureMode, setSignatureMode] = useState<OccurrenceAttachmentMode>(
    OCCURRENCE_ATTACHMENT_MODE.off,
  )
  const [notifies, setNotifies] = useState(false)
  const [emailTemplateKey, setEmailTemplateKey] = useState<string>(OCCURRENCE_TEMPLATE_NONE)
  /** RF3: o padrão é aceitar vários itens — preserva o comportamento de hoje. */
  const [allowsMultipleItems, setAllowsMultipleItems] = useState(true)
  /** Spec 164 D1: nasce `unset` — nenhum tipo novo escala para o contratante sem decisão explícita. */
  const [redeliveryPolicy, setRedeliveryPolicy] = useState<OccurrenceRedeliveryPolicy>(
    OCCURRENCE_REDELIVERY_POLICY.unset,
  )
  /** Spec 185 D2/RF6: padrão desligado — nenhum tipo novo tira nota da viagem sem decisão explícita. */
  const [leavesDocumentBehind, setLeavesDocumentBehind] = useState(false)
  /** Spec 179 RF1: nasce `off` — nenhum tipo novo passa a exigir foto sem decisão explícita. */
  const [attachmentMode, setAttachmentMode] = useState<OccurrenceAttachmentMode>(
    OCCURRENCE_ATTACHMENT_MODE.off,
  )
  /** Spec 241 RF10: nasce `optional`, o comportamento de hoje — Desligado é decisão explícita. */
  const [itemsMode, setItemsMode] = useState<OccurrenceItemsWriteMode>(
    OCCURRENCE_ITEMS_MODE.optional,
  )
  const isItemsOff = hasItemsModeSupport && itemsMode === OCCURRENCE_ITEMS_MODE.off

  function reset() {
    setName('')
    setNotifies(false)
    setEmailTemplateKey(OCCURRENCE_TEMPLATE_NONE)
    setAllowsMultipleItems(true)
    setRedeliveryPolicy(OCCURRENCE_REDELIVERY_POLICY.unset)
    setLeavesDocumentBehind(false)
    setAttachmentMode(OCCURRENCE_ATTACHMENT_MODE.off)
    setMoments(['separation'])
    setNoteMode(OCCURRENCE_ATTACHMENT_MODE.optional)
    setSignatureMode(OCCURRENCE_ATTACHMENT_MODE.off)
    setItemsMode(OCCURRENCE_ITEMS_MODE.optional)
  }

  return {
    allowsMultipleItems,
    attachmentMode,
    emailTemplateKey,
    isItemsOff,
    itemsMode,
    leavesDocumentBehind,
    moments,
    name,
    noteMode,
    notifies,
    redeliveryPolicy,
    reset,
    setAllowsMultipleItems,
    setAttachmentMode,
    setEmailTemplateKey,
    setItemsMode,
    setLeavesDocumentBehind,
    setMoments,
    setName,
    setNoteMode,
    setNotifies,
    setRedeliveryPolicy,
    setSignatureMode,
    signatureMode,
  }
}
