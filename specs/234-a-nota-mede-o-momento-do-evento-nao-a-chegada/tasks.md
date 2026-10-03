# Tasks

> 🤖 Modelo por fase abaixo. Tasks 🧠 (modelo de dados e regra de nota) rodam com `opus`; o resto,
> `sonnet`. A sessão precisa estar no modelo da fase antes de tocar em código (model-economy §2).

## Fase 1 — API: regra pura e contrato

> 🤖 Modelo: `opus` (T1.1 e T1.2 são 🧠), `sonnet` (T1.3 em diante)

- [x] **T1.1** 🧠 Contrato **antes**: `resolveOccurredAt` (corrige; futuro e velho demais descartam a
      correção; ausente cai no comportamento de hoje) — `apps/api-transportada/test/trips/occurred-at.contract.ts`.
- [x] **T1.2** 🧠 Contrato **antes** da pontualidade e do "ausente": CA1, CA2 e CA4 como casos de
      `classifyProofPunctuality` e do cálculo de `driver-score.policy.ts` — vermelho pelo motivo certo.
- [x] **T1.2b** 🧠 Ajustar os contratos pelas decisões do usuário (D4, D4b, CA6) e pela validação do
      architect: contrato no nível do caso de uso (derivação da flag, canal `office`, reenvio, fusão,
      foto de cargo), travas da janela de 90 dias e do `effectiveSince`, renomear os testes enganosos.
- [x] **T1.3** Implementar `resolveOccurredAt`, a pontualidade (D4) e o "ausente" (D5) — T1.1 e T1.2 verdes.
- [x] **T1.4** Esquemas `.strict()` aceitam `tappedAt`/`clockOffsetMs` opcionais; cliente antigo segue
      passando — contrato de rota.
- [x] **T1.5** 🧠 Migration `clock_offset_ms` + `rollback.sql`; gravar o evento com a hora corrigida;
      ler o momento da entrega da nota e da pontualidade (D3) — `make migration-test` e a integração da
      nota (CA3) verdes.
- [x] **T1.4b** O esquema do motorista nunca recusa o desvio de relógio por ser grande (sem teto de
      ±365 dias; `resolveOccurredAt` descarta o absurdo).
- [x] **T1.5b** Sem posição no relato, a hora corrigida do evento não vale — vale o horário de envio (D4b).
- [x] **T1.6** Registrar o limite antifraude em `docs/SECURITY.md`.
- [x] **R1–R5** Ajustes da revisão da Fase 1: foto corrigida só com evento corrigido e auditoria só do
      desvio usado (R1/R2), `tappedAt` de ano impossível descartado (R3), documentação velha e limites
      aceitos (R4/R5).
- [x] **T1.7** Publicar a API em staging e **confirmar o deploy** antes da Fase 2.

## Fase 2 — App: medir e mandar

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Contrato **antes**: o desvio sai do cabeçalho `Date`, o item da fila guarda o desvio da
      criação, e o corpo/multipart levam `tappedAt` e `clockOffsetMs` — vermelho.
- [x] **T2.2** `clockOffset.service.ts`, fila, `reportBody` e anexo — T2.1 verde.
- [x] **T2.3** Smoke: o corpo do `deliver` leva os dois campos; sem resposta ainda, vai sem eles.
- [x] **T2.4** Prova por mutação (cada fase) — evidência em `evidence.md`.
- [ ] **T2.5** Publicar o app em staging depois da API (T1.7).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/234-a-nota-mede-o-momento-do-evento-nao-a-chegada/
(leia spec.md, plan.md e tasks.md inteiros antes de tocar em código). Uma task por vez, na ordem do
tasks.md, em worktree/branch própria a partir de origin/staging (git fetch antes).

MODELOS (a sessão não troca de modelo: delegue cada task a um subagente `executor` com o modelo da fase):
- Fase 1 — API: T1.1, T1.2 e T1.5 são 🧠 → executor model=opus (T1.1 e T1.2 são os contratos que
  definem a regra da nota; T1.5 é a migration). T1.3, T1.4, T1.6 → executor model=sonnet. Antes de
  implementar T1.3, valide os contratos T1.1/T1.2 com architect model=opus.
- Fase 2 — App: T2.1 a T2.5 → executor model=sonnet.
- Revisão final de cada fase → code-reviewer model=opus, em passada separada (quem escreveu não aprova).

REGRAS DE CADA TASK (model-economy §3): teste/contrato ANTES do código, visto vermelho pelo motivo
certo; depois `bun run typecheck`, `bun run lint`, o teste da app pelo script do package.json (nunca
`bun test` cru), `bun run format:check` na raiz; commit isolado por task com caminhos explícitos
(`--no-verify`, nunca `git add -A`); prova por mutação onde a task muda regra; evidência em
`evidence.md`. Task só fecha com evidência.

FASE 1 (API) — gates extras: a migration é aditiva (coluna nula) e traz `rollback.sql`; rode
`make migration-test` e a integração da nota (CA3) contra um Postgres que de fato responda — se o
Postgres local estiver quebrado, suba um descartável; PULAR NÃO É PASSAR. Publique a API em staging
(T1.7) só com tudo verde, `git fetch` + rebase limpo + `bun install --frozen-lockfile` + typecheck
antes do push, e CONFIRME QUE O DEPLOY DA API SUBIU (gh run / Railway) antes de seguir.

FASE 2 (App) — só comece depois de T1.7 confirmada: os esquemas da API são `.strict()`, e app novo
contra API velha recebe 400 em todo relato. Se não conseguir confirmar o deploy da API, PARE e pergunte.

PARE E PERGUNTE antes de: deploy em produção (nunca), qualquer migration destrutiva, qualquer
[NEEDS CLARIFICATION], mudar o "momento da entrega" fora da nota e da pontualidade (está fora de
escopo), e qualquer mudança visível de tela (não há nenhuma prevista: o app só passa a mandar dois
campos). Não deixe stub, TODO nem teste pulado: são bloqueios, não evidência.
```
