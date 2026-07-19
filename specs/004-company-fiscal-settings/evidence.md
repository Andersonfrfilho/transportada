# Evidência — Feature 004

## Inventário e planejamento

Modelos:

- OpenCode gratuito: reservado para inventários e casos mecânicos;
- Codex Terra medium: implementação padrão e frontend;
- Codex Sol high: spec, desenho, criptografia, fiscal, tenant, concorrência e
  revisão de release.

Fontes confirmadas:

- constituição, arquitetura, domínio e plano de entrega do TransportAdA;
- contratos públicos instalados de
  `@adatechnology/fiscal-provider@0.1.0`;
- estrutura ESM/Bun dos packages `keycloak-jwt`, `drizzle-provider` e
  `rabbitmq-provider`;
- grafo local dos dois repositórios;
- regras globais e específicas de TypeScript, Bun, Drizzle, API, frontend e
  Makefile.

Decisões:

- frontend React + Vite;
- credencial A1 cifrada no PostgreSQL por package Ada compartilhado;
- uma credencial ativa por finalidade e CNPJ exatamente igual ao tenant;
- sequência CT-e com ledger idempotente e sem reutilização;
- nenhuma chamada SEFAZ, fila, exchange, S3 ou Railway nesta feature;
- PFX fornecido pelo usuário permanece fora do repositório e dos testes.

## T001 — ADRs e decomposição

Modelo executor e revisão independente: Codex Sol high.

Commits TransportAdA:

- `98723cf docs(spec): define company fiscal settings`;
- `9bfb6d6 docs(plan): design company fiscal settings`;
- `4fc417b docs(spec): plan company fiscal settings tasks`.

Artefatos:

- `docs/adr/0004-secret-envelope-and-a1-storage.md`;
- `docs/adr/0005-idempotent-fiscal-number-reservation.md`;
- `specs/004-company-fiscal-settings/spec.md`;
- `specs/004-company-fiscal-settings/plan.md`;
- `specs/004-company-fiscal-settings/tasks.md`.

A revisão final não encontrou P0/P1. Rastreabilidade cobre CFS-001–CFS-016 e
cada task declara dependência, verificação, critério de sucesso e modelo.

## T002 — Contracts do `secret-envelope`

Modelo executor e revisão: Codex Sol high.

Commit Ada local:

- `e0069bd test(crypto): define secret envelope contracts`.

Scaffold:

- package npm ESM público `@adatechnology/secret-envelope@0.0.0`;
- Bun `>=1.3`, TypeScript estrito, `tsup`, exports somente pela raiz e nenhuma
  dependência de runtime;
- API pública tipada e factory deliberadamente não implementada;
- nenhum changeset, lockfile, bump ou publicação.

Os 16 contracts cobrem:

- round-trip binário, nonce de 12 bytes e envelope imutável;
- snapshot das chaves fornecidas pelo chamador;
- AAD obrigatório e framing sem colisão por concatenação;
- adulteração de AAD, nonce, ciphertext e tag;
- rotação com leitura pela chave antiga e nenhuma tentativa de fallback;
- chave incorreta sob o mesmo `keyId`;
- keyrings inválidos e chave de tamanho diferente de 32 bytes;
- parser estrito de versão, algoritmo, `keyId`, campos extras e base64url;
- limites de plaintext, ciphertext, nonce e tag;
- erros tipados sem chave, plaintext, AAD ou envelope;
- ausência de escrita em `console`.

Evidência local:

```text
bun run format:check
All matched files use Prettier code style

bun run check
tsc --noEmit
exit 0

pre-commit lint-staged
eslint --fix + prettier --write
exit 0

bun test test/secret-envelope.contract.test.ts
0 pass, 16 fail
```

As 16 falhas são o estado RED esperado e nascem somente do stub
`Secret envelope provider is not implemented`. Nenhum AES foi implementado.
O commit Ada permanece local e não será enviado enquanto a T003 não restaurar
todos os gates verdes.

## T003 — Envelope AES-256-GCM versionado

Modelo executor e revisão independente: Codex Sol high.

Commit Ada local:

- `1cbbc00 feat(crypto): implement authenticated secret envelopes`.

Implementação:

- AES-256-GCM por Web Crypto, nonce aleatório de 12 bytes e tag de 128 bits;
- factory síncrona, snapshot do keyring e importação tardia de `CryptoKey` não
  extraível;
- envelope e base64url canônicos, parser estrito e limites antes da
  decodificação;
- seleção exclusiva por `keyId`, rotação e erros constantes sem payload
  sensível;
- AAD interno domain-separated e length-prefixed vinculando versão, algoritmo,
  `keyId` e AAD externo;
- limpeza best-effort das cópias temporárias e zero dependências de runtime.

A revisão encontrou adulteração possível do `keyId` quando duas IDs usavam o
mesmo material. Um contract regressivo reproduziu a falha antes da correção e
passou depois do framing autenticado. Entradas com getters hostis também foram
normalizadas para erros tipados sem vazamento. A revisão final aprovou sem
P0/P1.

Evidência local:

```text
bun run check
tsc --noEmit
exit 0

bun run test
20 pass, 0 fail, 79 assertions

pnpm exec eslint packages/backend/secret-envelope/src packages/backend/secret-envelope/test
ESLint: No issues found

bun run format:check
All matched files use Prettier code style

bun run build
ESM dist/index.js 11.91 KB
DTS dist/index.d.ts 1.63 KB
```

O build reutilizou temporariamente o `tsup@8.5.1` já instalado no monorepo,
sem manter symlink ou `dist`. Instalação Bun limpa, tarball, lockfile, bump,
publicação npm e push do package pertencem às T004/T005. O certificado PFX,
sua senha, Railway, S3 e SEFAZ não foram acessados.

## T004 — Empacotamento e consumo Bun isolado

Executor: Codex Terra medium. Revisão independente: Codex Sol high, aprovada
sem P0–P3 materiais.

Commit Ada local:

- `685d8b3 test(packaging): verify isolated Bun consumption`.

Implementação:

- `prepack` sempre produz ESM e declarações antes do tarball;
- teste agregado gera dois tarballs e exige bytes idênticos;
- allowlist exata permite somente `README.md`, `package.json`,
  `dist/index.js` e `dist/index.d.ts`;
- consumidor temporário instala o `.tgz` local com Bun, executa typecheck real
  contra as declarações instaladas e importa o módulo ESM em runtime;
- package instalado não possui dependências runtime nem referência ao logger;
- `pnpm-lock.yaml` recebeu somente o importer do novo workspace.

Evidência local:

```text
pnpm install --frozen-lockfile --offline
Lockfile is up to date
exit 0

bun run check
tsc --noEmit
exit 0

bun run test
21 pass, 0 fail, 90 assertions

bun test ./test/package.integration.ts
1 pass, 0 fail

npm pack --dry-run --json
4 entries: README.md, package.json, dist/index.js, dist/index.d.ts

prettier + eslint + git diff --check
exit 0
```

O comando da task foi corrigido para `bun test ./test/package.integration.ts`,
pois Bun 1.3.14 exige `./` para tratar um nome que não termina em `.test` ou
`.spec` como caminho explícito.

Os commits Ada continuam locais porque o push em `packages/**` dispara o
workflow de publicação. A T005 fará changeset, bump e pin antes desse push,
evitando publicar acidentalmente `0.0.0`. Nenhum npm publish, certificado,
Railway, S3 ou SEFAZ foi acessado.
