/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * O avatar do balão do motorista, na conversa da ocorrência: sem foto, mostra as iniciais dele no círculo; sem nome
 * para tirar iniciais, volta ao ícone do participante.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { ParticipantAvatar } from '@/modules/occurrence-conversation/components/ParticipantBadge.component'

describe('o avatar do motorista na conversa da ocorrência', () => {
  test('com iniciais, o círculo mostra as letras e não o ícone', () => {
    const html = renderToStaticMarkup(<ParticipantAvatar initials="JS" participant="driver" />)
    expect(html).toContain('>JS<')
    expect(html).not.toContain('<svg')
  })

  test('sem iniciais, o círculo mostra o ícone do participante', () => {
    const html = renderToStaticMarkup(<ParticipantAvatar participant="driver" />)
    expect(html).toContain('<svg')
  })
})
