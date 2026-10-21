/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * O publicador mora em `src/cli` para ser bundlado por `bun run build` e viajar na imagem (a imagem de runtime
 * não leva `scripts/`): em staging e produção roda por
 * `railway ssh --service api -- bun ./dist/cli/occurrence-mail-templates-publish.js --company <uuid>`.
 * Este arquivo só mantém o caminho de sempre para quem roda do checkout.
 */
import '../src/cli/occurrence-mail-templates-publish.js'
