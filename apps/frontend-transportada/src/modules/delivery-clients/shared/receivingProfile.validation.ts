/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormIssues } from './contractorFormIssue.types'
import type { ReceivingProfileDraft } from './receivingProfileDraft.service'

export function validateReceivingProfileDraft(draft: ReceivingProfileDraft): FormIssues {
  void draft
  return {}
}
