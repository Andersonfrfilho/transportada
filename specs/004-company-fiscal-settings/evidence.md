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
