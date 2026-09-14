/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildContractorMailSettingsSubmission,
  buildContractorMailWebhookUrl,
  toContractorMailSettingsDraft,
  CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON,
  EMPTY_CONTRACTOR_MAIL_SETTINGS_DRAFT,
} from '../../src/modules/delivery-clients/shared/contractorMailSettingsForm.service'
import type { ContractorMailSettingsSummary } from '../../src/modules/delivery-clients/shared/contractorMailSettings.types'

const SUMMARY: ContractorMailSettingsSummary = {
  apiKeyConfigured: true,
  id: 'settings-1',
  lastWebhookAt: null,
  replyDomain: 'reply.example.com',
  senderAddress: 'occurrences@example.com',
  senderName: 'Example Transportadora',
  status: 'pending',
  version: '3',
  webhookId: 'webhook-1',
  webhookSecretConfigured: true,
}

describe('contractor mail settings form service', () => {
  test('the draft never carries a secret back, even with an existing summary', () => {
    const draft = toContractorMailSettingsDraft(SUMMARY)
    expect(draft.apiKey).toBe('')
    expect(draft.webhookSigningSecret).toBe('')
    expect(draft.replyDomain).toBe(SUMMARY.replyDomain)
    expect(draft.senderAddress).toBe(SUMMARY.senderAddress)
    expect(draft.senderName).toBe(SUMMARY.senderName)
  })

  test('without a summary the draft is empty', () => {
    expect(toContractorMailSettingsDraft(null)).toEqual(EMPTY_CONTRACTOR_MAIL_SETTINGS_DRAFT)
    expect(toContractorMailSettingsDraft(undefined)).toEqual(EMPTY_CONTRACTOR_MAIL_SETTINGS_DRAFT)
  })

  test('an empty secret is omitted from the body, never sent as an empty string', () => {
    const submission = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: '',
        replyDomain: 'reply.example.com',
        senderAddress: 'occurrences@example.com',
        senderName: 'Example',
        webhookSigningSecret: '',
      },
      existingVersion: '3',
    })

    expect(submission.status).toBe('ready')
    if (submission.status !== 'ready') return
    expect('apiKey' in submission.body).toBe(false)
    expect('webhookSigningSecret' in submission.body).toBe(false)
  })

  test('sends the expectedVersion that was read, and omits it on the first save', () => {
    const withVersion = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: '',
        replyDomain: 'reply.example.com',
        senderAddress: 'occurrences@example.com',
        senderName: 'Example',
        webhookSigningSecret: '',
      },
      existingVersion: '7',
    })
    expect(withVersion.status).toBe('ready')
    if (withVersion.status === 'ready') expect(withVersion.body.expectedVersion).toBe('7')

    const firstSave = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: 're_test',
        replyDomain: 'reply.example.com',
        senderAddress: 'occurrences@example.com',
        senderName: 'Example',
        webhookSigningSecret: 'whsec_test',
      },
      existingVersion: undefined,
    })
    expect(firstSave.status).toBe('ready')
    if (firstSave.status === 'ready') {
      expect('expectedVersion' in firstSave.body).toBe(false)
    }
  })

  test('refuses a webhook secret without the whsec_ prefix', () => {
    const submission = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: '',
        replyDomain: 'reply.example.com',
        senderAddress: 'occurrences@example.com',
        senderName: 'Example',
        webhookSigningSecret: 'not-the-right-format',
      },
      existingVersion: '3',
    })

    expect(submission).toEqual({
      reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.WEBHOOK_SECRET_INVALID,
      status: 'blocked',
    })
  })

  test('refuses a reply domain with fewer than three labels', () => {
    const submission = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: '',
        replyDomain: 'example.com',
        senderAddress: 'occurrences@example.com',
        senderName: 'Example',
        webhookSigningSecret: '',
      },
      existingVersion: '3',
    })

    expect(submission).toEqual({
      reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.REPLY_DOMAIN_INVALID,
      status: 'blocked',
    })
  })

  test('accepts a reply domain with exactly three labels', () => {
    const submission = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: '',
        replyDomain: 'reply.example.com',
        senderAddress: 'occurrences@example.com',
        senderName: 'Example',
        webhookSigningSecret: '',
      },
      existingVersion: '3',
    })

    expect(submission.status).toBe('ready')
  })

  test('requires both secrets on the first save', () => {
    const submission = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: '',
        replyDomain: 'reply.example.com',
        senderAddress: 'occurrences@example.com',
        senderName: 'Example',
        webhookSigningSecret: '',
      },
      existingVersion: undefined,
    })

    expect(submission).toEqual({
      reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.SECRETS_REQUIRED_FIRST_SAVE,
      status: 'blocked',
    })
  })

  test('requires sender address and sender name', () => {
    const withoutAddress = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: '',
        replyDomain: 'reply.example.com',
        senderAddress: '  ',
        senderName: 'Example',
        webhookSigningSecret: '',
      },
      existingVersion: '3',
    })
    expect(withoutAddress).toEqual({
      reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.SENDER_ADDRESS_REQUIRED,
      status: 'blocked',
    })

    const withoutName = buildContractorMailSettingsSubmission({
      draft: {
        apiKey: '',
        replyDomain: 'reply.example.com',
        senderAddress: 'occurrences@example.com',
        senderName: '  ',
        webhookSigningSecret: '',
      },
      existingVersion: '3',
    })
    expect(withoutName).toEqual({
      reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.SENDER_NAME_REQUIRED,
      status: 'blocked',
    })
  })

  test('builds the webhook URL from the api base URL and the webhook id', () => {
    expect(
      buildContractorMailWebhookUrl({ apiUrl: 'https://api.example.com', webhookId: 'abc-123' }),
    ).toBe('https://api.example.com/public/inbound-emails/abc-123')
  })
})
