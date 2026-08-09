# Feature 028 — Distribuição agendada observável

## Problema e resultado

A busca remota de NF-e na SEFAZ (cron `nfe.distribution.pull` → RabbitMQ → worker) está completa e
funcionando, mas **nunca roda para nenhuma empresa**, e nada no produto diz por quê.

Duas causas, verificadas no banco de staging em 05/08/2026:

1. **O opt-in não tem como ser ligado.** `createEnableScheduledDistributionUseCase` existe, está
   testado (`test/companies/synthetic-actor.contract.ts`) e não tem consumidor: nenhuma rota HTTP,
   nenhum seed, nenhuma fiação no composition root. Sem linha em `company_distribution_settings` e
   sem a membership do ator sintético, o `innerJoin` do cron devolve conjunto vazio.
2. **O cron não conta o que viu.** `isCompanyEligibleForDistribution` devolve `boolean`; a empresa
   inelegível some do resultado sem registrar em qual condição caiu. O ciclo loga
   `cron_distribution_candidates_evaluated` com `evaluatedCount` e fecha — para o operador é
   indistinguível de "rodou e não tinha nota".

Estado real de staging no momento da spec: empresa ativa, perfil fiscal preenchido, certificado A1
`purpose: cte` ativo com CNPJ batendo com o perfil (subiu 21:20:01 em 05/08/2026, depois do fix de
CORS do commit `18a3cae`) — e `company_distribution_settings` com **zero** linhas.

Resultado esperado: o operador liga a distribuição agendada por um botão, e as duas telas onde ele
já está dizem, sem ambiguidade, se a busca remota está ativa, o que falta quando não está, quando
rodou pela última vez e quantas notas trouxe.

## Fora do escopo

- Disparar a busca remota sob demanda ("puxar agora"). O gatilho manual já existe por outro caminho
  (`POST /nfe-imports/distribution`); esta spec só torna o agendado ligável e legível.
- Mostrar **horário do próximo disparo do cron**. O agendamento vive no Railway, não no código — a
  API não tem como saber. O que a tela mostra é `nextAllowedAt` do cursor (a próxima janela
  permitida pelo cooldown anti-656), que é um dado real e já persistido.
- Histórico paginado de ciclos. A tela mostra a última execução; o histórico completo já é a lista
  de importações que a tela de notas exibe.
- Alterar a cadência pela UI. `CADENCE_MINUTES` continua sendo variável de ambiente do cron.

## Decisões

### D1 — Razão de inelegibilidade é vocabulário fechado, duplicado por cópia

A policy passa a devolver `{ eligible: true } | { eligible: false, reason }` com `reason` num union
fechado:

| Razão                          | Significado                                                    |
| ------------------------------ | -------------------------------------------------------------- |
| `company_disabled`             | empresa não está `active`                                      |
| `not_opted_in`                 | sem linha em `company_distribution_settings` ou flag desligada |
| `missing_synthetic_membership` | ator sintético sem membership ativa na empresa                 |
| `certificate_missing`          | nenhum certificado `active`                                    |
| `certificate_not_yet_valid`    | `validFrom` no futuro                                          |
| `certificate_expired`          | `expiresAt` no passado                                         |
| `cooldown_active`              | dentro da janela anti-656 (`nextAllowedAt` no futuro)          |

A ordem de avaliação é a da tabela, e a **primeira** razão encontrada é a reportada — é a que o
operador precisa resolver primeiro.

A regra vive em duas cópias: `apps/cron-transportada/src/nfe-distribution-pull/domain/` (decide o
ciclo) e `apps/api-transportada/src/companies/domain/` (responde as telas). Nenhuma app importa
código-fonte de outra (CLAUDE.md), e o precedente é o schema Drizzle já duplicado no worker. Um
contract test em cada lado fixa a mesma tabela de razões; divergência quebra o build.

`cooldown_active` é a única razão **transitória**: significa que está tudo certo e a próxima janela
ainda não chegou. A UI a trata como estado saudável, não como pendência.

### D2 — Uma regra de status, dois pontos de leitura

`createGetScheduledDistributionStatusUseCase` é único. É exposto em duas rotas porque as duas telas
têm permissões diferentes:

| Rota                                           | Permissão         | Consumidor                |
| ---------------------------------------------- | ----------------- | ------------------------- |
| `GET /company-settings/scheduled-distribution` | `settings.manage` | tela de configurações     |
| `GET /nfe-imports/distribution` (estendida)    | `invoices.read`   | tela de notas, aba Remota |

Duplicar a rota e não a regra mantém cada módulo do frontend com o seu próprio client HTTP, como
manda o CLAUDE.md, sem que um operacional sem `settings.manage` perca a informação da tela dele.

### D3 — Escrita só em configurações

`PUT` e `DELETE /company-settings/scheduled-distribution` exigem `settings.manage`. A aba Remota da
tela de notas mostra o estado e, quando desligado, um atalho que **navega** para as configurações —
não um segundo ponto de escrita. Dois lugares que gravam a mesma flag são dois lugares para manter
em sincronia e para auditar.

`PUT` é idempotente: ligar o que já está ligado devolve 200 com o mesmo corpo. Ele também garante
ator sintético e membership (`ensureSystemActor` / `ensureCompanyMembership`), que é o que hoje
falta junto com a flag.

`DELETE` desliga a flag e **preserva** a membership do ator sintético e o cursor — desligar a
automação não pode apagar o rastro de NSU já consumido, sob pena de reprocessar tudo ao religar.

### D4 — "Quantas notas trouxe" vem de `nfe_imports`

A última execução automática é a linha mais recente de `nfe_imports` com
`triggered_by = 'automation'` e `automation_job = 'nfe.distribution.pull'`. O número exibido é
`received_count`, com `status` ao lado — uma execução `failed` que trouxe 0 é informação diferente
de uma `completed` que trouxe 0, e a tela não pode achatar as duas.

## Critérios de aceite

1. `PUT /company-settings/scheduled-distribution` cria a linha de opt-in, o ator sintético e a
   membership numa transação; repetir devolve 200 sem duplicar nada.
2. `DELETE` desliga a flag e mantém membership e cursor intactos.
3. Sem `settings.manage`, `PUT`/`DELETE`/`GET` de configurações respondem 403 antes de qualquer
   trabalho protegido.
4. Ambas as rotas de leitura devolvem o mesmo `ScheduledDistributionStatus` para o mesmo estado.
5. Toda razão da tabela D1 é produzida pela policy da API e pela do cron para o mesmo fato.
6. O cron loga `cron_company_not_eligible` com `companyId` e `reason` por empresa descartada, e
   `cron_cycle_completed` passa a carregar a contagem por razão.
7. A tela de configurações mostra o estado e, quando inelegível, a razão em pt-BR acentuado.
8. A aba Remota mostra estado, última execução, `received_count`, status e próxima janela; quando
   desligado, o atalho para configurações.
9. Todo estado de carregamento das duas telas usa esqueleto (`docs/frontend/loading.md`).
10. Nenhum log novo carrega CNPJ, razão social ou qualquer conteúdo de XML.
