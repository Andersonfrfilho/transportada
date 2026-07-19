/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  breakpoints: true,
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/database/database.schema.ts',
})
