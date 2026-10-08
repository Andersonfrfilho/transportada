/* Copyright (c) 2026 Ada Technology. MIT License. */
const EXCLUDED_WITHOUT_TRIP_KEY = 'documents.reportExcludedWithoutTrip'

type NoticeInput = Readonly<{
  count: number
  translate: (key: string, options: { count: number }) => string
}>

export function buildExcludedWithoutTripNotice(input: NoticeInput): string | undefined {
  if (input.count <= 0) return undefined
  return input.translate(EXCLUDED_WITHOUT_TRIP_KEY, { count: input.count })
}
