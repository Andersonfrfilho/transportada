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

$ bun run test
 1692 pass  0 fail   (api,      1695 testes / 77 arquivos)
  233 pass  0 fail   (worker,    233 testes / 37 arquivos)
   40 pass  0 fail   (cron,       40 testes /  2 arquivos)
  725 pass  0 fail   (frontend,  725 testes / 16 arquivos)

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

## T011 — validação em staging

_Pendente._ O deploy de `8984d46` foi disparado em `develop`; a validação depende de uma janela do
cron (`0 * * * *`) com o opt-in ligado e um certificado ativo na empresa de staging.
