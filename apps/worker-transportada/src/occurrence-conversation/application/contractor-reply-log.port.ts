/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 276: only for the log (no address, text, file name or note): what the reply did with this message. `ignored` is a
 * message the reply does not wait for (closed reply, or already answered); `applied` carries the new status, the
 * reason, whether the boleto check read any text, and whether this call delivered to the driver.
 */
export type ContractorReplyLogOutcome =
  | { readonly kind: 'company_user_sender' }
  | { readonly kind: 'ignored' }
  | { readonly kind: 'no_reply' }
  | {
      readonly delivered: boolean
      readonly documentChecked: boolean
      readonly documentTextRead: boolean
      readonly kind: 'applied'
      readonly reason: null | string
      readonly toStatus: string
    }
