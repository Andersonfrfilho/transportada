/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248: o retorno da contratante fala por símbolo antes de falar por frase. Todo estado, entrega e
 * destino tem um ícone do catálogo do design system; estado novo sem ícone reprova aqui, não na tela.
 */
import { describe, expect, test } from 'bun:test'

import { ICON_PATHS } from '@/components/ui/icon'
import {
  describeContractorReplyState,
  ICON_BY_DELIVERY_STATUS,
  ICON_BY_DELIVERY_TARGET,
  ICON_BY_STATUS,
} from '@/modules/occurrence-conversation/shared/contractorReply.service'
import {
  CONTRACTOR_REPLY_DELIVERY_TARGETS,
  CONTRACTOR_REPLY_STATUSES,
} from '@/modules/occurrence-conversation/shared/contractorReply.types'

describe('os ícones do retorno da contratante (spec 248)', () => {
  test('todo estado tem um ícone que existe no catálogo, e o selo o usa', () => {
    for (const status of CONTRACTOR_REPLY_STATUSES) {
      const name = ICON_BY_STATUS[status]
      expect(Object.keys(ICON_PATHS)).toContain(name)
      expect(
        describeContractorReplyState(
          { alertCount: 0, deadlineAt: null, reason: null, status },
          new Date(),
        ).iconName,
      ).toBe(name)
    }
  })

  test('todo destino e todo desfecho de entrega têm ícone no catálogo', () => {
    for (const target of CONTRACTOR_REPLY_DELIVERY_TARGETS) {
      expect(Object.keys(ICON_PATHS)).toContain(ICON_BY_DELIVERY_TARGET[target] ?? '')
    }
    for (const name of Object.values(ICON_BY_DELIVERY_STATUS)) {
      expect(Object.keys(ICON_PATHS)).toContain(name)
    }
  })

  test('atrasada e precisa do operador usam o alerta; entregue usa o visto', () => {
    expect(ICON_BY_STATUS.overdue).toBe('alert')
    expect(ICON_BY_STATUS.needs_operator).toBe('alert')
    expect(ICON_BY_STATUS.delivered).toBe('check')
  })
})
