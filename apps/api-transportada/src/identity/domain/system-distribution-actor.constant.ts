/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Non-human system identity that owns scheduled (cron-triggered) NF-e
 * distribution imports. A single fixed row in identity_users, referenced by one
 * user_company_memberships per opted-in company, keeps the actor columns on
 * nfe_imports/processing_outbox NOT NULL without a Keycloak external identity.
 * Real-user listing queries must exclude this id.
 */
export const SYSTEM_DISTRIBUTION_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000006'
