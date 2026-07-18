/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { bootstrap } from '../../src/main'

const server = bootstrap()
console.log(`API_TEST_READY:${server.port}`)
