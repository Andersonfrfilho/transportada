/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { JobRunEnvelopeV1 } from '../domain/job-run-envelope.schema.js'

export type JobRunPublisherPort = {
  publish(params: { readonly envelope: JobRunEnvelopeV1 }): Promise<void>
}
