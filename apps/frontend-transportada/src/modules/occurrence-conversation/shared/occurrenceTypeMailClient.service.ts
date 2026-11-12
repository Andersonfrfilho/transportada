/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './occurrenceConversationGuards.validation'
import {
  OCCURRENCE_CONVERSATION_ERROR,
  OccurrenceConversationRequestError,
  requestJson,
  type ClientDependencies,
} from './occurrenceConversationClient.service'
import type {
  ClientChannelTemplateChoice,
  ClientChannelTemplateProblemCode,
  ContractorMailTemplateChoice,
  ContractorTemplateProblem,
  OccurrenceTypeRecipientCandidate,
} from './occurrenceTypeMail.types'

const TEMPLATES_PATH = '/company-settings/occurrence-types/contractor-mail-templates'
const CLIENT_CHANNEL_TEMPLATES_PATH = '/company-settings/occurrence-types/client-channel-templates'
const RECIPIENT_CANDIDATES_PATH =
  '/company-settings/occurrence-types/contractor-mail-recipient-candidates'

const PROBLEM_CODES: readonly string[] = [
  'empty_subject',
  'malformed_placeholder',
  'missing_message_area',
  'not_found',
  'system_key',
  'unknown_variables',
  'unsafe_html',
]

export type OccurrenceTypeMailClient = Readonly<{
  /** Spec 286 (RF2): os modelos por canal que a matriz "Retorno ao cliente" pode escolher. */
  listClientChannelTemplates: () => Promise<readonly ClientChannelTemplateChoice[]>
  listRecipientCandidates: (
    input: Readonly<{ contractorIds: readonly string[] }>,
  ) => Promise<readonly OccurrenceTypeRecipientCandidate[]>
  listTemplates: () => Promise<readonly ContractorMailTemplateChoice[]>
}>

function toProblem(value: unknown): ContractorTemplateProblem | null {
  if (!isRecord(value) || !isString(value.code) || !PROBLEM_CODES.includes(value.code)) return null
  const variables = Array.isArray(value.variables) ? value.variables.filter(isString) : undefined
  return {
    code: value.code as ContractorTemplateProblem['code'],
    ...(variables === undefined ? {} : { variables }),
  }
}

function toTemplate(value: unknown): ContractorMailTemplateChoice | null {
  if (
    !isRecord(value) ||
    !isString(value.key) ||
    !isString(value.subject) ||
    !isString(value.body) ||
    typeof value.version !== 'number' ||
    typeof value.usable !== 'boolean' ||
    !Array.isArray(value.problems)
  ) {
    return null
  }
  return {
    body: value.body,
    key: value.key,
    problems: value.problems.flatMap((problem) => toProblem(problem) ?? []),
    subject: value.subject,
    usable: value.usable,
    version: value.version,
  }
}

const CLIENT_CHANNEL_PROBLEM_CODES: readonly string[] = [
  'empty_body',
  'empty_subject',
  'not_found',
  'system_key',
]

function toClientChannelTemplate(value: unknown): ClientChannelTemplateChoice | null {
  if (
    !isRecord(value) ||
    (value.channel !== 'email' && value.channel !== 'whatsapp') ||
    !isString(value.key) ||
    !isString(value.body) ||
    (value.subject !== null && !isString(value.subject)) ||
    typeof value.version !== 'number' ||
    typeof value.usable !== 'boolean' ||
    !Array.isArray(value.problems)
  ) {
    return null
  }
  return {
    body: value.body,
    channel: value.channel,
    key: value.key,
    problems: value.problems.flatMap((problem) =>
      isRecord(problem) &&
      isString(problem.code) &&
      CLIENT_CHANNEL_PROBLEM_CODES.includes(problem.code)
        ? [{ code: problem.code as ClientChannelTemplateProblemCode }]
        : [],
    ),
    subject: value.subject,
    usable: value.usable,
    version: value.version,
  }
}

function toCandidate(value: unknown): OccurrenceTypeRecipientCandidate | null {
  if (
    !isRecord(value) ||
    !isString(value.contactId) ||
    !isString(value.contractorId) ||
    !isString(value.email) ||
    !isString(value.name) ||
    !isString(value.status) ||
    typeof value.receivesOccurrences !== 'boolean'
  ) {
    return null
  }
  return {
    contactId: value.contactId,
    contractorId: value.contractorId,
    email: value.email,
    name: value.name,
    receivesOccurrences: value.receivesOccurrences,
    status: value.status,
  }
}

function readData(payload: unknown): readonly unknown[] {
  const data = isRecord(payload) ? payload.data : undefined
  if (!Array.isArray(data)) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return data
}

/** Spec 271: as leituras do editor do tipo (`settings.manage`): modelos escolhíveis e contatos candidatos. */
export function createOccurrenceTypeMailClient(
  dependencies: ClientDependencies,
): OccurrenceTypeMailClient {
  return {
    async listClientChannelTemplates() {
      return readData(await requestJson(dependencies, CLIENT_CHANNEL_TEMPLATES_PATH)).flatMap(
        (template) => toClientChannelTemplate(template) ?? [],
      )
    },
    async listRecipientCandidates({ contractorIds }) {
      if (contractorIds.length === 0) return []
      const query = new URLSearchParams({ contractorIds: contractorIds.join(',') }).toString()
      const payload = await requestJson(dependencies, `${RECIPIENT_CANDIDATES_PATH}?${query}`)
      return readData(payload).flatMap((candidate) => toCandidate(candidate) ?? [])
    },
    async listTemplates() {
      return readData(await requestJson(dependencies, TEMPLATES_PATH)).flatMap(
        (template) => toTemplate(template) ?? [],
      )
    },
  }
}
