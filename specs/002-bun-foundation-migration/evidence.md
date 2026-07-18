# Evidência — Feature 002

## T001 — Decisão arquitetural

- decisão explícita do mantenedor registrada na ADR 0001;
- revisão Codex Sol confirmou conflitos da fundação anterior;
- documentação oficial confirmou `Bun.serve` sobre uWebSockets;
- documentação oficial confirmou Drizzle com `drizzle-orm/bun-sql`;
- frontend auditado contra Vite, PWA, tokens, i18n e TanStack Query;
- nenhuma emissão real ou ação Railway executada.

## T002 — Contrato Bun do fiscal provider

Modelo executor: Codex Sol high. Revisão e gates executados pelo agente
principal.

Alterações em `@adatechnology/fiscal-provider`:

- suíte consumidora importa somente o entrypoint público `src/index.ts`;
- factory cria `SefazCteProvider` com `emit`, `cancel` e `testConnection`;
- mapeamento do TMS `homologation/production` para
  `homologacao/producao` é explícito;
- PFX ICP-Brasil sintético é criado e descartado em memória;
- emissão CT-e assina XML localmente e usa `fetch` mockado, sem rede;
- erros públicos `FiscalError`, `FiscalConnectionError`,
  `FiscalRejectionError` e `FiscalTimeoutError` mantêm hierarquia e códigos.

Gates locais:

| Comando                         | Resultado                                               |
| ------------------------------- | ------------------------------------------------------- |
| `bun run check`                 | aprovado                                                |
| `bun run test`                  | 13 locais + 5 contratos aprovados; testes reais pulados |
| `bun run build`                 | aprovado                                                |
| Prettier nos arquivos alterados | aprovado                                                |

Nenhum certificado, senha ou XML real foi persistido ou incluído no teste.
Nenhuma chamada à SEFAZ ou ação Railway foi executada.

Bloqueios mantidos para produção:

- `FiscalValidationError` existe internamente, mas não é exportado;
- transporte SEFAZ ainda permite TLS sem validar a cadeia;
- provider CT-e escreve diretamente em stdout/stderr;
- DACTE e consulta de CT-e não possuem contrato público confirmado.

Commit no repositório Ada: `eee0ec2`.

## T003 — Provider Drizzle/Bun SQL

Modelo executor: Codex Terra medium. Revisão independente: Codex Sol high.

Alterações em `@adatechnology/drizzle-provider`:

- factory pública sobre `drizzle-orm/bun-sql` e `Bun.SQL`;
- configuração restrita a PostgreSQL em tipos e validação de runtime;
- `EmptyRelations` como default, impedindo queries relacionais não configuradas;
- health check real, transações expostas pelo banco tipado e shutdown
  idempotente;
- Drizzle RC e tipos Bun fixados exatamente para reprodutibilidade;
- nenhum schema ou migration específica do TransportAdA.

Gates locais contra PostgreSQL do Compose em `localhost:55432`:

| Comando                                                  | Resultado                         |
| -------------------------------------------------------- | --------------------------------- |
| `bun run check`                                          | aprovado                          |
| `bun run test:integration` com URL local                 | 4 testes aprovados, nenhum pulado |
| `bun run build`                                          | ESM e declarações aprovados       |
| `pnpm exec eslint packages/backend/drizzle-provider/src` | aprovado                          |
| `bun run format:check`                                   | aprovado                          |

A suíte comprovou conexão/health, rollback transacional, rejeição de protocolo
incompatível e shutdown com query em voo, closes concorrentes e rejeição de
novas queries após o fechamento. O script de integração falha cedo quando
nenhuma URL de teste é fornecida.

Commit no repositório Ada: `64ffa52`.

Nenhuma publicação, ação Railway ou push foi executado.
