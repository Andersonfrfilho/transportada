/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { alias } from 'drizzle-orm/pg-core'

import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'

export const reportDocument = alias(nfeDocuments, 'trip_report_document')
export const reportEmitter = alias(nfeParticipants, 'trip_report_emitter')
export const reportRecipient = alias(nfeParticipants, 'trip_report_recipient')
