# Tasks

Uma fase só. O conserto é pequeno; o que o torna uma spec é mexer numa decisão que a 217 tomou.

## Fase 1 — A conclusão deixa de parecer reatribuição

> 🤖 Modelo: `sonnet` (nenhuma task 🧠 — a decisão está fechada na spec)

- [ ] **T1.1** Confirmar no schema qual coluna marca a conclusão da viagem (`updatedAt` ou coluna
      própria) e registrar a escolha em `evidence.md` — `apps/api-transportada/src/database/trip.schema.ts` —
      evidência: o trecho do schema citado, com o nome da coluna que a janela vai usar.
- [ ] **T1.2** [P] Varrer os chamadores de `GET /me/trips/current` e afirmar que só o app do
      motorista o consome — evidência: a lista de chamadores em `evidence.md`.
- [ ] **T1.3** Teste de integração **antes** da implementação: viagem concluída aparece dentro da
      janela com `status: 'completed'` e não aparece fora dela —
      `apps/api-transportada/test/integration/current-driver-trip-concluded-window.integration.ts`
      (+ a linha na lista de `package.json`, senão não roda) — evidência: vermelho pelo motivo certo.
- [ ] **T1.4** A consulta aceita ativo **ou** concluído na janela, com a constante nomeada —
      `apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts` —
      evidência: T1.3 verde, `bun --env-file=../../.env.test run test:integration` na app.
- [ ] **T1.5** Teste de contrato do seletor: concluída não é eleita em nenhum dos três caminhos
      (CA2) — `apps/frontend-driver/test/driver-trip/trip-selection.contract.ts` — evidência:
      vermelho antes, verde depois da T1.6.
- [ ] **T1.6** `resolveSelectedTrip` descarta viagem concluída —
      `apps/frontend-driver/src/modules/driver-trip/shared/driverTripSelection.service.ts` —
      evidência: T1.5 verde.
- [ ] **T1.7** Trocar o caso inalcançável pelo real em
      `apps/frontend-driver/test/driver-trip/trip-reassignment.contract.ts`: a sequência
      `on_delivery_route` → `completed` → ausente não avisa (CA3), e a troca de tripulação sem passar
      por `completed` continua avisando (CA4) — evidência: o caso antigo removido no diff, não
      apenas somado.
- [ ] **T1.8** Prova por mutação (CA5): desfazer a T1.6 faz T1.5 falhar; desfazer a T1.4 faz T1.3
      falhar — evidência: as duas saídas de falha em `evidence.md`.
- [ ] **T1.9** Revisão de design e usabilidade (CA6, web.md §15): print da tela ao concluir a última
      viagem — estado de sem viagem, **sem** o aviso — em 375, 768 e 1280, entregue ao usuário.
- [ ] **T1.11** (achado da T1.2) A cópia legada do painel também ignora viagem concluída ao pegar
      `trips[0]` — `apps/frontend-transportada/src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx:140`
      e `.../DriverProfile.page.tsx:43` — evidência: contrato no painel afirmando que viagem
      concluída não é exibida. Não é a remoção do módulo (Fase 10 da 189, sob aprovação).
- [ ] **T1.10** Atualizar o contexto da I.A.: `apps/frontend-driver/CLAUDE.md` (o aviso e por que o
      status concluído agora chega), `apps/api-transportada/CLAUDE.md` (a janela na consulta) e a
      emenda à 217 em `specs/217-.../spec.md` apontando para esta spec.

Cada task fecha com typecheck + os testes da app tocada + commit isolado, e a evidência em
`evidence.md`. ⚠️ Teste novo da API só roda se o arquivo entrar na lista do `package.json`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/224-a-viagem-terminada-nao-foi-movida/ por
inteiro. Leia spec.md, plan.md e tasks.md antes de tocar em código, e trate a seção "Decisão" da
spec como fechada — a janela no servidor é a escolha, não reabrir a comparação com a memória no app.
Uma task por vez, na ordem do tasks.md, T1.1 a T1.10.

Modelos: Fase 1 → subagente executor com model=sonnet · revisão final → code-reviewer model=opus.
Nenhuma task é 🧠.

Comece commitando os três arquivos da spec, que estão sem commit na árvore.

Teste antes da implementação, obrigatório em T1.3, T1.5 e T1.7: rodar e ver vermelho pelo motivo
certo ANTES de escrever o conserto. Em T1.7 o caso antigo ("concluída não é aviso", que monta a
lista anterior com status 'completed') tem de SAIR no diff — substituído, não somado: ele afirma um
estado que o endpoint não produz, e é por isso que o defeito passou. T1.8 é prova por mutação:
desfazer T1.6 faz T1.5 falhar, desfazer T1.4 faz T1.3 falhar, com as duas saídas em evidence.md.

Cada task fecha com typecheck + os testes da app tocada + commit isolado, e evidência em
evidence.md. Armadilhas desta base, todas já custaram tempo:
- Na API são DOIS comandos de teste, listas diferentes, nenhum cobre o outro, de dentro de
  apps/api-transportada: `bun --env-file=../../.env.test test --timeout 120000` (contrato) e
  `bun --env-file=../../.env.test run test:integration` (integração). Sem o --env-file a integração
  PULA em vez de falhar, e pular não é passar.
- Teste novo só roda se o arquivo entrar na lista explícita do package.json da app.
- No frontend-driver o comando é `bun run check` / `bun run test`, nunca `bun test` cru — o cru
  varre os .smoke.spec.ts do Playwright e produz dezenas de erros que não são defeito.
- eslint é por app, com a app como cwd; da raiz ele falha com multiple candidate TSConfigRootDirs.
- Rodar os gates longos em primeiro plano; background morre e não vira evidência.

Ao fim, com tudo verde: prettier nos .md (format:check da raiz é gate e specs entram nele),
`bun install --frozen-lockfile`, format:check + lint + typecheck na raiz, e então
`git fetch && git rebase origin/staging && git push origin HEAD:staging`. Depois do rebase, rodar o
typecheck de novo antes do push: props que outra spec tornou obrigatórios não geram conflito, só
erro de tipo.

Pare e pergunte antes de: promover para produção, deploy manual, migration destrutiva, qualquer
[NEEDS CLARIFICATION], e antes de mudar a decisão da spec. T1.9 entrega os prints ao usuário.
```
