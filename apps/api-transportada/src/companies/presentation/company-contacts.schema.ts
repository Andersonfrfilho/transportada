/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  COMPANY_CONTACT_KINDS,
  COMPANY_SOCIAL_NETWORKS,
} from '../../database/company-contact.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import type { CompanyContactSettings } from '../application/company-contacts.port.js'

/** Dez a treze dígitos: fixo com DDD e celular com DDI, sem máscara — o mesmo do CHECK do banco. */
const PHONE_PATTERN = /^[0-9]{10,13}$/u
const MAX_CONTACTS = 20
const MAX_LABEL_LENGTH = 40
const MAX_URL_LENGTH = 300

const contactSchema = z
  .object({
    isWhatsapp: z.boolean().default(false),
    kind: z.enum(COMPANY_CONTACT_KINDS),
    label: z.string().trim().max(MAX_LABEL_LENGTH).default(''),
    value: z.string().trim().min(1),
  })
  .strict()
  /*
   * As duas metades do CHECK ditas na fronteira, para o operador receber a razão em vez do 500 do
   * banco: telefone é só dígito, e-mail tem forma de e-mail, e e-mail nunca é WhatsApp.
   */
  .superRefine((contact, context) => {
    if (contact.kind === 'phone' && !PHONE_PATTERN.test(contact.value)) {
      context.addIssue({
        code: 'custom',
        message: 'phone must have 10 to 13 digits, without punctuation',
        path: ['value'],
      })
    }
    if (contact.kind === 'email') {
      if (!z.string().email().safeParse(contact.value).success) {
        context.addIssue({ code: 'custom', message: 'invalid email', path: ['value'] })
      }
      if (contact.isWhatsapp) {
        context.addIssue({
          code: 'custom',
          message: 'only a phone can be marked as WhatsApp',
          path: ['isWhatsapp'],
        })
      }
    }
  })

const socialLinkSchema = z
  .object({
    network: z.enum(COMPANY_SOCIAL_NETWORKS),
    url: z.string().trim().url().max(MAX_URL_LENGTH).startsWith('https://'),
  })
  .strict()

const settingsSchema = z
  .object({
    contacts: z.array(contactSchema).max(MAX_CONTACTS).default([]),
    socialLinks: z.array(socialLinkSchema).max(COMPANY_SOCIAL_NETWORKS.length).default([]),
  })
  .strict()
  /** Uma rede por empresa: duas contas do mesmo Instagram na lista é engano de digitação. */
  .superRefine((settings, context) => {
    const networks = new Set<string>()
    for (const [index, link] of settings.socialLinks.entries()) {
      if (networks.has(link.network)) {
        context.addIssue({
          code: 'custom',
          message: 'one link per social network',
          path: ['socialLinks', index, 'network'],
        })
      }
      networks.add(link.network)
    }
  })

export function parseCompanyContactsBody(request: Request): Promise<CompanyContactSettings> {
  return parseBody(settingsSchema, request)
}
