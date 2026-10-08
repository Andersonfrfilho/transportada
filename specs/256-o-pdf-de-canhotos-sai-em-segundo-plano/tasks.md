# Tasks — Spec 256

Gates de **toda** task: typecheck (`tsc --noEmit`), testes da app (lista explícita em `package.json`;
API: contrato **e** integração com `--env-file=../../.env.test`), commit isolado, linha em
`evidence.md`. Escalada: gate falhou 2x → sobe um nível (haiku → sonnet → opus) e registra.
Worktree própria: `make worktree NAME=spec-256`. Teste primeiro, depois a implementação.

## Fase 0 — Medir e decidir

> 🤖 Modelo: `sonnet` (T0.1) · T0.2 🧠 → `opus`

- **T0.1** Medir em staging, só leitura: tamanho médio e p95 das fotos de canhoto; tamanho do PDF e pico
  de memória do `pdfkit` sem `bufferPages` para 100/500/1000 canhotos; se o storage S3-compatível
  aceita multipart/stream. Aceite: números e método em `evidence.md`. (RF6)
- **T0.2 🧠** ADR: tamanho do arquivo único (reamostrar × baixar o teto), teto final de canhotos,
  estratégia de upload, colunas de dimensão e permissão `trip.proof-export`. Validar com `architect`.
  Aceite: ADR em `docs/adr/` e `plan.md` ajustado. (RF1, RF6)

## Fase 1 — Dados

> 🤖 Modelo: `sonnet`

- **T1.1** Migration aditiva `trip_proof_exports` + colunas de dimensão no canhoto; schema Drizzle;
  teste de migration e rollback (`make migration-test`). Aceite: verde, sem ENUM nativo. (RF2)

## Fase 2 — API

> 🤖 Modelo: `sonnet` · T2.1 🧠 → `opus`

- **T2.1 🧠** Permissão `trip.proof-export` no `realm/` e no mapeamento de permissões; contrato do
  realm. **Parar e perguntar antes de aplicar no Keycloak.** Aceite: contrato do realm verde. (RF1)
- **T2.2** Schema Zod + tipos + erros (`TRIP_PROOF_EXPORT_KEY_REUSED`, `_EMPTY`, `_TOO_MANY_OPEN`,
  `_NOT_READY`, `_EXPIRED`) e `create-trip-proof-export.use-case.ts` (resolve ids, teto, abertos,
  idempotência, outbox na mesma transação). Aceite: testes de caminho feliz e de cada erro. (RF1, RF2)
- **T2.3** `get`/`list`/`cancel`/`download-url` e rotas com rate limit; 404 para não-dono (BOLA);
  cancelar é idempotente. Aceite: contrato + integração com banco, incluindo outro usuário e outra
  empresa. (RF3, RF4, RF5)

## Fase 3 — Worker

> 🤖 Modelo: `haiku` (T3.1) · `sonnet` (T3.2 a T3.4)

- **T3.1** Copiar `trip-proof-page.layout.ts` e o desenho para o worker + contrato de paridade com a
  API (mesmo conjunto fixo de blocos, mesma paginação). Aceite: contrato de paridade verde. (RF8)
- **T3.2** Consumidor (prefetch 1), leitura das informações por `company_id`, passe 1 (medir) e passe 2
  (desenhar sem `bufferPages`, rodapé por página), arquivo temporário. Aceite: teste com PDF de 120
  blocos confere `%PDF`, número de páginas e memória estável. (RF6)
- **T3.3** Upload por fluxo/multipart (ou em partes, conforme a T0.2), progresso a cada 25 blocos ou
  2 s, cancelamento entre blocos, 3 tentativas por imagem e "Imagem indisponível". Aceite: testes com
  imagem corrompida, cancelamento no meio e falha de upload. (RF6, RF7)
- **T3.4** `trip-proof-export-retention`: purga a cada hora (24 h), presos > 30 min → `failed`. Aceite:
  teste com relógio falso. (RF10)

## Fase 4 — Front

> 🤖 Modelo: `sonnet` (T4.1, T4.2) · `haiku` (T4.3)

- **T4.1** Serviço + `useTripProofExport.hook.ts` (mutation + polling de 2 s, cancelar, baixar por
  navegação direta). Aceite: teste do hook com serviço falso (progresso, cancelar, 422 com teto,
  expirado). (RF9)
- **T4.2** `TripProofExportPanel` (barra `aria-live`, cancelar, baixar) e `TripProofExportList`
  (recentes); o botão da 253 passa a criar o trabalho nas duas telas e some o limite de 100. Aceite:
  teste dos componentes e contrato dos botões. (RF9)
- **T4.3** i18n pt-BR/en acentuado. Aceite: paridade de chaves + grep sem texto fixo. (RF11)

## Fase 5 — Fechamento

> 🤖 Modelo: `haiku` (T5.1) · `sonnet` (T5.2) · T5.3 depois da produção

- **T5.1** Docs vivas (`docs/ai-context/api-transportada.md`, `worker-transportada.md`, `CLAUDE.md` das
  apps) e auditoria §15 (N+1, `Promise.all`, logs sem PII, sem stack em 500). Aceite: grep + checklist
  em `evidence.md`. (RF11)
- **T5.2** Verificação em staging do fluxo completo (350 canhotos): progresso, cancelar, baixar, expirar;
  `code-reviewer` (sonnet) e `security-reviewer` como segunda passada. Aceite: divergências corrigidas
  ou listadas. (RF3 a RF9)
- **T5.3** Depois de a 256 estar em produção: aposentar `GET .../proofs-pdf`, gateway/use case da API,
  serviço do front e o contrato de paridade. Aceite: sem referências restantes (grep) e testes verdes. (RF12)

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/256-o-pdf-de-canhotos-sai-em-segundo-plano/ (leia
spec.md, plan.md e tasks.md antes de começar). Trabalhe na worktree `make worktree NAME=spec-256`.
Escopo: PDF de canhotos em segundo plano, num arquivo só, com progresso e cancelamento (RF1-RF11);
T5.3 (RF12) só depois de a 256 estar em produção.
Uma task por vez, na ordem do tasks.md; testes primeiro e registrados na lista explícita do package.json.
Modelos: Fase 0 → T0.1 executor model=sonnet, T0.2 🧠 opus (validar com architect antes de implementar) ·
Fase 1 → executor model=sonnet · Fase 2 → executor model=sonnet (T2.1 🧠 opus, validar com architect) ·
Fase 3 → T3.1 executor model=haiku, T3.2-T3.4 executor model=sonnet · Fase 4 → T4.1-T4.2 executor
model=sonnet, T4.3 model=haiku · Fase 5 → T5.1 haiku, T5.2 e revisão final → code-reviewer model=sonnet
e security-reviewer.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes (na API, contrato e integração) + commit isolado, evidência em
evidence.md.
Pare e pergunte antes de: deploy, aplicar a permissão nova no Keycloak, migration destrutiva, qualquer
[NEEDS CLARIFICATION].
Ao terminar ou ao ser só pedido de texto, rode /oh-my-claudecode:cancel.
```
