/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ResolveStopReminderOriginParams,
  StopReminderOriginResult,
} from './driver-stop-reminder.types.js'

export function resolveStopReminderOrigin(
  params: ResolveStopReminderOriginParams,
): StopReminderOriginResult {
  const { sharedPoint, previousStopPoint, companyPoint } = params
  if (sharedPoint) return { kind: 'shared_point', point: sharedPoint, isSharedPoint: true }
  if (previousStopPoint) {
    return { kind: 'previous_stop', point: previousStopPoint, isSharedPoint: false }
  }
  if (companyPoint) return { kind: 'company', point: companyPoint, isSharedPoint: false }
  return { kind: 'fallback', point: undefined, isSharedPoint: false }
}
