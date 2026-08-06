# Evidências — Feature 028

Formato de cada registro: task, comando rodado, saída relevante e o que ela prova. Nenhuma senha,
segredo de client, certificado, chave de acesso de NF-e ou dado fiscal real entra aqui.

## Por que a feature existe

A busca automática de notas já rodava desde a 013, mas era invisível: quem não recebia nota não
tinha como saber se o cron não rodou, se a empresa não estava elegível ou se simplesmente não havia
nota nova. O cron descartava empresa em silêncio e a tela não sabia da existência do agendamento.

A 028 fecha isso nas duas pontas — o cron passa a dizer **por que** descartou, e a mesma razão
chega à tela pelo mesmo vocabulário.

## T001–T002 — vocabulário de razões na API

```
$ bun test ./test/companies.contract.test.ts
bun test v1.3.14 (0d9b296a)

 35 pass
 0 fail
 66 expect() calls
Ran 35 tests across 1 file. [34.00ms]
```

`test/companies/distribution-eligibility.contract.ts` foi escrito antes da policy e cobre as sete
razões da tabela D1 (`company_disabled`, `not_opted_in`, `missing_synthetic_membership`,
`certificate_missing`, `certificate_not_yet_valid`, `certificate_expired`, `cooldown_active`) **e a
ordem de precedência entre elas** — a primeira razão encontrada é a reportada, e essa ordem é o que
faz a tela dizer "sem certificado" em vez de "em cooldown" para uma empresa que tem os dois
problemas.

`src/companies/domain/distribution-eligibility.policy.ts` devolve
`{ eligible: true } | { eligible: false, reason }` — booleano sozinho não sustentaria a tela.

## T003–T005 — o cron devolve e loga a razão do descarte

```
$ bun test ./test/nfe-distribution-pull.contract.test.ts
bun test v1.3.14 (0d9b296a)

 34 pass
 0 fail
 60 expect() calls
Ran 34 tests across 1 file. [16.00ms]
```

`test/nfe-distribution-pull/eligibility-reasons.contract.ts` repete a tabela D1 no cron. É a
guarda contra a divergência silenciosa: a policy do cron é **cópia** da policy da API (as duas apps
não compartilham código-fonte), e sem os dois contratos apontando para a mesma tabela, mudar um lado
e esquecer o outro faria a tela prometer uma busca que o ciclo descarta.

O log ficou em dois níveis: `cron_company_not_eligible` por empresa em
`select-eligible-companies.use-case.ts`, com a razão; e `ineligibleCounts` agregado por razão em
`cron_cycle_completed` (`run-cycle.ts`). Um responde "por que esta empresa não recebeu nota", o
outro responde "o que está bloqueando a base inteira" sem precisar ler linha por linha.

## T006–T007 — status, rotas e fiação

Coberto pela mesma suíte de T001–T002 acima (`test/companies.contract.test.ts`).

`get-scheduled-distribution-status.use-case.ts` compõe quatro coisas num objeto só: opt-in,
elegibilidade (T002), cursor do SEFAZ e a última importação com `triggered_by = 'automation'`.

Três rotas em `/company-settings/scheduled-distribution`, todas `settings.manage` com escopo
`company`: `GET` lê, `PUT` liga, `DELETE` desliga. `PUT` e `DELETE` respondem com o status completo
recalculado — a tela não precisa de uma segunda chamada para saber em que estado ficou.

Detalhe que evita um bug de estreia: o `PUT` provisiona o ator sintético e a membership da empresa
**na mesma transação** que liga o opt-in (`ensureSystemActor` → `ensureCompanyMembership` →
`enableScheduledDistribution`). Sem isso, ligar pela tela deixaria a empresa elegível na intenção e
bloqueada por `missing_synthetic_membership` no ciclo seguinte.

## T008 — a rota de importações serve o mesmo estado

```
$ bun run --cwd apps/api-transportada test
 1692 pass
 0 fail
Ran 1695 tests across 77 files. [923.00ms]
```

`test/companies/scheduled-distribution-parity.contract.ts` executa as duas rotas com o mesmo estado
de domínio e compara os corpos. A aba Remota e a tela de configurações leem por caminhos diferentes;
divergir o corpo faria uma contar uma história e a outra outra sobre a mesma empresa.

## T009 — painel e interruptor em `company-settings`

```
$ bun test ./test/company-settings.contract.test.ts ./test/nfe-workspace.contract.test.ts
bun test v1.3.14 (0d9b296a)

 217 pass
 0 fail
 753 expect() calls
Ran 217 tests across 2 files. [56.00ms]
```

Client, hook, componente, esqueleto de carregamento e os dois catálogos de tradução. As sete razões
foram traduzidas para pt-BR como frase de ação, não como código: `missing_synthetic_membership` vira
"o operador automático ainda não foi provisionado neste ambiente. Fale com o suporte." — quem lê
precisa saber o que fazer, não o nome interno da razão.

## T010 — aba Remota do `nfe-workspace`

Mesma suíte de T009 acima. `test/nfe-workspace/scheduled-distribution.contract.ts` acrescenta sete
testes:

- o cursor de distribuição carrega `scheduled` e **recusa** um corpo sem ele ou com ele parcial
  (`NFE_WORKSPACE_RESPONSE_INVALID`);
- o atalho para configurações empurra a rota, lembra o workspace e avisa o shell **nessa ordem** — a
  navegação aqui é manual, sem `popstate` a troca de rota não chega ao `main.tsx`;
- o atalho só existe para quem tem `settings.manage`;
- os onze rótulos existem nos dois catálogos;
- o cartão não reescreve o vocabulário de bloqueio: usa `resolveIneligibilityLabelKey` com
  `ns: 'companySettings'`.

Esse último é o que importa a longo prazo. Traduzir as sete razões de novo no `nfeWorkspace` teria
funcionado hoje e divergido no primeiro ajuste de texto.

A tela de notas **não escreve**: quando a busca está desligada e a pessoa administra configurações,
ela oferece o caminho até o interruptor. A fonte da verdade continua sendo uma só.

## Gates do repositório

```
$ bun run typecheck   # api, worker, cron, frontend — limpo
$ bun run lint        # eslint --max-warnings=0 nas quatro apps — limpo
$ bun run format:check
All matched files use Prettier code style!

$ bun run test        # já com os contratos de T013 e T014
 1695 pass  3 skip  0 fail   (api,      1698 testes / 78 arquivos)
  236 pass         0 fail   (worker,    236 testes / 38 arquivos)
   46 pass         0 fail   (cron,       46 testes /  3 arquivos)
  725 pass         0 fail   (frontend,  725 testes / 16 arquivos)

$ bun run build       # quatro artefatos gerados
```

## T012 — documentação

O `cron-transportada` existia desde a 013 e não estava documentado em lugar nenhum — nem na
estrutura do monorepo no `CLAUDE.md`, nem no diagrama de `docs/spec/architecture.md`. Um agente ou
uma pessoa nova no repo não tinha como saber que existe uma quarta aplicação.

Agora está nos dois, com o que se precisa saber antes de mexer: é one-shot (um ciclo por execução,
sem agendador embutido), pina um único socket Postgres por causa do advisory lock de sessão, e não
fala com o broker nem com o SEFAZ — grava a mesma linha de importação que a API gravaria e deixa o
outbox e o worker seguirem o caminho de sempre.

A policy duplicada por cópia ganhou seção própria em `architecture.md`: por que a cópia se paga hoje
(a alternativa seria publicar um pacote Ada por uma policy de trinta linhas, ou acoplar o cron ao
HTTP da API), qual é o preço, quais contratos seguram a divergência, e quando ela deixa de valer a
pena — no terceiro consumidor.

## T013 — o log estruturado não chegava a staging

Achado ao ir buscar a evidência de T011. O ciclo das 23:18 em staging imprimiu isto e nada mais:

```
[c33d43ab][7554af27][cron-transportada:0.1.0][nfe.distribution.pull] cron_distribution_candidates_evaluated
[c33d43ab][7554af27][cron-transportada:0.1.0][nfe.distribution.pull] cron_cycle_completed
```

Sem `evaluatedCount`, sem `ineligibleCounts`, sem a razão de nenhuma empresa — ou seja, sem
exatamente aquilo que T005 entregou. O modo `pretty` do `@adatechnology/logger` renderiza só a
mensagem e **descarta o `meta`**; as quatro apps pediam `pretty: appEnv !== 'production'` e o
staging roda com `APP_ENV=staging`. Tudo o que não fosse produção perdia o contexto.

Os contract tests de T005 passavam porque afirmam sobre os **argumentos** entregues ao logger, não
sobre a saída renderizada. O contrato novo fecha o outro lado:

```
$ bun run --cwd apps/cron-transportada test
 43 pass  0 fail   (era 40 — três testes novos de formato)

$ bun run --cwd apps/api-transportada test
 1695 pass  3 skip  0 fail

$ bun run --cwd apps/worker-transportada test
 236 pass  0 fail
```

`shouldPrettyPrintLogs(appEnv)` mora em `src/logging/log-format.policy.ts` de cada app — cópia, como
a policy de elegibilidade, porque as apps não importam código-fonte uma da outra. É consumida nos
quatro pontos que montam logger: `api/src/main.ts`, `worker/src/main.ts`,
`worker/src/nfe-imports/nfe-address-city-code-backfill.main.ts` e
`cron/src/logging/cycle-logger.service.ts`. Só `local` continua legível para humano; qualquer outro
ambiente — inclusive um nome que ninguém previu — emite JSON.

Verificado com o logger real, ambiente `staging`:

```json
{
  "timestamp": "…",
  "level": "INFO",
  "requestId": "…",
  "traceId": "probe-trace",
  "message": "[…][cron-transportada:0.1.0][nfe.distribution.pull] cron_cycle_completed",
  "meta": {
    "acquiredLock": true,
    "eligibleCount": 0,
    "ineligibleCounts": { "certificate_missing": 1, "not_opted_in": 2 }
  }
}
```

## T014 — a varredura do cron não enxergava quem nunca optou

O primeiro ciclo com `meta` visível em staging entregou isto:

```
cron_distribution_candidates_evaluated  meta={"environment":"homologation","evaluatedCount":0}
cron_cycle_completed  meta={"acquiredLock":true,"eligibleCount":0,"enqueuedCount":0,
  "ineligibleCounts":{"company_disabled":0,"not_opted_in":0,"missing_synthetic_membership":0,
  "certificate_missing":0,"certificate_not_yet_valid":0,"certificate_expired":0,
  "cooldown_active":0},"skippedCount":0}
```

Sete zeros. Lê-se como "nada bloqueado" — e a causa estava no `FROM`:

| Consulta                                                       | Partia de                       | Empresa sem linha de configuração |
| -------------------------------------------------------------- | ------------------------------- | --------------------------------- |
| `drizzle-scheduled-distribution-status.repository.ts` (a tela) | `companies`                     | aparece, desligada                |
| `drizzle-distribution-candidate.source.ts` (o cron)            | `company_distribution_settings` | invisível                         |

A linha em `company_distribution_settings` só nasce no `upsert` de ligar ou desligar. Antes disso a
empresa não existia para o ciclo: `evaluatedCount: 0` não distinguia "banco vazio" de "ninguém tocou
no interruptor", e `not_opted_in` só podia disparar para quem ligou e depois desligou — justamente a
minoria. A razão mais comum do vocabulário era a única incapaz de aparecer.

A varredura passou a partir de `companies` com as configurações em `leftJoin`, e
`scheduledDistributionEnabled` sem linha coalesce para `false` — que é o mesmo `?? false` que a tela
já fazia. As duas passam a responder a mesma coisa sobre a mesma empresa.

```
$ bun run --cwd apps/cron-transportada test
 46 pass  0 fail   (era 43 — três testes novos de escopo)
```

O primeiro ciclo em staging depois do deploy (`9e6c3a8`, 06/08 00:43) já conta a empresa que sempre
esteve lá:

```
cron_distribution_candidates_evaluated  meta={"environment":"homologation","evaluatedCount":1}
cron_company_not_eligible  meta={"companyId":"1d314e12-…","reason":"not_opted_in"}
cron_cycle_completed  meta={"acquiredLock":true,"eligibleCount":0,"enqueuedCount":0,
  "ineligibleCounts":{…,"not_opted_in":1,…},"skippedCount":0}
```

`evaluatedCount: 1` no lugar de `0`, e a razão nomeada em vez de sete zeros. O ciclo passou a
responder por que a empresa não recebeu nota — que é o que a feature 028 se propôs a fazer.

`test/nfe-distribution-pull/candidate-scope.contract.ts` prende os dois lados: o mapeamento (linha
sem configuração vira `not_opted_in`, não some) e o `FROM` da consulta, porque a diferença aqui não
estava na regra, estava em de onde a regra recebia as linhas.

Preço aceito: o ciclo agora emite `cron_company_not_eligible` por empresa não elegível a cada janela.
No modelo de instalação dedicada (ADR-0021) isso é uma linha por hora, e é o log que responde
"por que esta empresa não recebeu nota".

## T011 — validação em staging

Opt-in ligado pela tela de configurações em 05/08 22:2x (-03). O primeiro ciclo depois disso passou
a empresa pela policy inteira e enfileirou:

```
$ railway logs --service cron --environment staging
[nfe.distribution.pull] cron_distribution_candidates_evaluated
  meta={"environment":"homologation","evaluatedCount":1}
[nfe.distribution.pull] cron_cycle_completed timestamp="2026-08-06T01:25:42.511Z"
  meta={"acquiredLock":true,"cronJob":"nfe.distribution.pull","eligibleCount":1,"enqueuedCount":1,
    "failedCount":0,"skippedCount":0,
    "ineligibleCounts":{"company_disabled":0,"not_opted_in":0,"missing_synthetic_membership":0,
      "certificate_missing":0,"certificate_not_yet_valid":0,"certificate_expired":0,
      "cooldown_active":0}}
```

`eligibleCount: 1` / `enqueuedCount: 1` e as sete razões zeradas — nenhum descarte. Comparado ao
T014, a mesma empresa que saía em `not_opted_in` agora atravessa.

O outro lado da cadeia, um segundo depois, no worker — a mensagem que o relay entregou:

```
$ railway logs --service worker --environment staging
nfe_distribution_consumer_received  meta={"companyId":"1d314e12-…","importId":"f8e7ce57-…"}
nfe_distribution_pull_started       meta={"environment":"homologation","ultNsu":"000000000000000"}
nfe_distribution_sefaz_page_received
  meta={"fetched":0,"maxNsu":"000000000000000","temMais":false,"ultNsu":"000000000000000"}
nfe_distribution_rate_limit_window_applied  meta={"nextAllowedAt":"2026-08-06T02:25:45.298Z"}
nfe_distribution_pull_finished
  meta={"status":"rate-limited","fetched":0,"persisted":0,"duplicated":0}
```

Cron → `processing_outbox` → relay → RabbitMQ → consumidor → SEFAZ, sem intervenção manual em
nenhum ponto. **`fetched: 0`**: o ambiente é homologação e o NSU do CNPJ de teste está em zero com
`temMais: false` — a SEFAZ não tem nota para devolver. Nota recebida de verdade é evidência que só
production produz; o que staging podia provar, provou. O cooldown de uma hora foi gravado
(`nextAllowedAt` 02:25:45Z), e é ele que a tela mostra até a janela virar.

⚠️ O ciclo rodou às 01:25 UTC, não às 02:00 — o Railway executa o CronJob uma vez no deploy, além
do `cronSchedule`. Não é um desvio de cadência; é um ciclo extra, e ele obedeceu ao mesmo lock e ao
mesmo cooldown.

**Descoberta desta validação:** com o opt-in ligado e nenhum ciclo ainda, a tela não sabia dizer
quando a próxima busca aconteceria — o único horário que ela tinha era o `nextAllowedAt`, nulo até
a primeira consulta à SEFAZ. `nextScheduledRunAt` fechou o buraco (commit `3e31d68`): a cadência
vem por `SCHEDULED_DISTRIBUTION_CRON`, um contrato lê o `deploy/cron/railway.json` para as duas
pontas não divergirem, e expressão que a política não sabe resolver derruba o boot em vez de servir
data inventada.
