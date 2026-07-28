/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Copy of the API system distribution actor id. Parity with
 * apps/api-transportada/src/identity/domain/system-distribution-actor.constant.ts.
 * A single fixed identity_users row, referenced by one user_company_memberships
 * per opted-in company, keeps the actor columns on nfe_imports/processing_outbox
 * NOT NULL for automation enqueues without a Keycloak external identity.
 */
export const SYSTEM_DISTRIBUTION_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000006'
