# Feature 029 — Lançamento em produção

## Problema e resultado

O ambiente `production` do Railway **nunca subiu**. O que existe hoje, verificado por
`railway status` em 07/08/2026:

| Ambiente     | Serviços                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `staging`    | `Postgres`, `Postgres-q0RQ`, `api`, `cron`, `keycloak`, `rabbitmq`, `transportada-frontend`, `worker` |
| `production` | `Postgres-FDoz`, `Postgres-Hqfu` — **só os dois bancos**                                              |

Faltam seis serviços de aplicação: `api`, `worker`, `cron`, `transportada-frontend`, `keycloak`
e `rabbitmq`. Os dois Postgres estão na imagem `ghcr.io/railwayapp-templates/postgres-ssl:18`,
com volume, sem TCP proxy — não são alcançáveis de fora do projeto.

E `main` está **82 commits e 9 migrations** atrás de `staging`:

```text
20260804143209_user_invitations              20260806161903_cte_fiscal_number_advanced_event
20260805020005_trip_planning_expansion       20260807022114_cte_issuance_diagnostics
20260805030010_trip_backfill_existing_manifests  20260807113744_nfe_party_trade_name_and_phone
20260805165955_identity_user_profiles        20260807223440_rntrc_registry_leading_zero
20260806143116_identity_user_profile_username
```

Subir os seis serviços é o passo mecânico. O que **não** existe e precisa existir antes é a
camada que torna production operável e recuperável — hoje ela é zero em todas as frentes:

- **Log fora da plataforma**: nenhum. `rg -i "sentry|drain|otel"` no repositório não devolve nada.
- **Rastreamento de erro**: nenhum. Erro em production só aparece se alguém abrir o log do Railway.
- **Redação de PII**: nenhuma. `@adatechnology/logger@0.0.1` serializa `meta` cru — não há
  denylist, allowlist nem varredura de valor. A regra de segurança §1 diz que a redação vive no
  logger, e ela não vive.
- **Backup**: nenhum. O banco tem volume, e volume não é backup.
- **Teste de restore**: nenhum, porque não há backup.
- **Alerta**: nenhum. `/health/live` e `/health/ready` existem e ninguém os observa.
- **Required reviewers**: o job `deploy` já usa o GitHub Environment `production`
  (`.github/workflows/deploy.yml:60`), mas o Environment não tem revisor obrigatório — hoje um
  merge em `main` publica sozinho.

`docs/spec/railway.md` § Pendências operacionais já registra os itens 3 (required reviewers),
4 (backup da keyring) e 5 (domínios de production) como abertos. Esta feature os fecha e
acrescenta o que faltava na lista.

**Resultado esperado:** production no ar, com o dado fiscal recuperável em menos de uma hora a
partir de um backup que já foi restaurado de verdade, com erro chegando a alguém sem PII junto,
e com uma aprovação humana entre o merge e o deploy.

## Fora do escopo

- **Habilitar emissão fiscal real.** Continua atrás da configuração por empresa (certificado A1,
  perfil fiscal, série). O ambiente de pé não emite CT-e sozinho.
- **Migrar dado de staging para production.** Production nasce vazia. Staging é homologação e o
  dado dela é de teste.
- **APM, métricas e tracing distribuído.** `tracesSampleRate: 0` — trace multiplica volume e
  compute do stack de observabilidade, e métrica sem alguém para olhar é custo sem uso.
- **Rotação da keyring de criptografia.** Entra como chave nova na keyring quando for necessária
  (ADR-0004); esta feature só garante que a keyring de production existe e está copiada fora do
  Railway.
- **Automatizar a criação do primeiro usuário no Keycloak.** Continua manual até a fase C da
  feature 026 entregar o gateway (`docs/spec/railway.md` § Identidade).
- **Alta disponibilidade, réplica de leitura, multi-região.** Uma instalação por transportadora
  (ADR-0021) com um único cliente não justifica nenhum dos três.

## Decisões

### D1 — Os gates vêm antes do primeiro deploy, não depois

A ordem não é preferência de processo: existe uma janela em que production tem dado fiscal e não
tem cópia dele, e essa janela precisa ter duração zero. Documento fiscal autorizado tem prazo de
guarda medido em anos, e o XML original é imutável por decisão de arquitetura (ADR-0006) — perder
o bucket ou o banco não é um incidente que se resolve reprocessando.

Cinco fases, em ordem, cada uma com evidência antes da seguinte:

| Fase | O quê                                                              | Por que antes                                            |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| A    | Redação de PII, destino de log, rastreio de erro                   | O primeiro deploy já loga; log sem redação não se desfaz |
| B    | Backup dos dois bancos e do bucket, restore provado contra staging | Provar o pipeline enquanto errar é barato                |
| C    | Required reviewers, proteção de `main`, tokens                     | O portão precisa existir antes de haver o que publicar   |
| D    | Subir os seis serviços de production                               | —                                                        |
| E    | Ligar backup e alerta em production, prova de vida                 | Fechar a janela sem cópia no mesmo dia                   |

### D2 — Software livre auto-hospedado no Railway, nenhum free tier

Free tier não é gratuidade: é uma cota que o fornecedor muda quando quiser. Um gate de
lançamento que depende de "5 mil erros por mês" ou "3 dias de retenção" é um gate com data de
validade — no dia em que o limite estoura ou o plano muda, o alerta e o log somem sem aviso, e
somem exatamente no mês movimentado, que é quando fazem falta. Toda ferramenta desta feature é
**open source**, roda no **Railway que já se paga**, e o dado fica em bucket nosso.

| Necessidade          | Ferramenta                                     | Licença                 | Onde roda                     |
| -------------------- | ---------------------------------------------- | ----------------------- | ----------------------------- |
| Coleta e roteamento  | Vector                                         | MPL-2.0                 | serviço `vector`, no ambiente |
| Arquivo de log       | sink S3 do Vector → bucket `transportada-logs` | —                       | bucket Railway (projeto ops)  |
| Busca de log         | OpenObserve                                    | AGPL-3.0                | projeto `transportada-ops`    |
| Rastreamento de erro | GlitchTip                                      | MIT                     | projeto `transportada-ops`    |
| Alerta e uptime      | Gatus                                          | Apache-2.0              | projeto `transportada-ops`    |
| Backup               | `pg_dump` + `openssl` + `aws` CLI              | PostgreSQL / Apache-2.0 | serviço `backup`, no ambiente |
| Destino do backup    | bucket `transportada-backups`                  | —                       | bucket Railway (projeto ops)  |

**GlitchTip fala o protocolo do Sentry.** Aceita os SDKs `@sentry/*` sem reinstrumentar nada: só o
DSN muda. É por isso que a D4 continua valendo palavra por palavra — o SDK, o `sendDefaultPii:
false` e o `beforeSend` com o redator são os mesmos, apontando para o nosso host em vez do SaaS.
A variável continua se chamando `SENTRY_DSN` porque é o nome que o SDK lê sozinho do ambiente;
brigar com a convenção do SDK para renomear uma variável não compra nada.

Railway tem template pronto de [GlitchTip](https://railway.com/deploy/glitchtip-sentry-alternative),
que sobe em minutos. O **Gatus** não vem de template: sobe do `deploy/gatus/` deste repositório,
porque quem é monitorado precisa ser diff de pull request, e não estado clicado num painel — a
decisão e as alternativas descartadas estão em [ADR-0025](../../docs/adr/0025-gatus-over-uptime-kuma.md).

> ⚠️ **O Railway não tem log drain.** A documentação é explícita: não existe configuração de
> drain, e o caminho suportado é um serviço Vector recebendo os eventos por private networking e
> encaminhando para o intake HTTP do agregador. Não adianta procurar o botão. Os _Monitors_ do
> painel exigem plano Pro — por isso o alerta é o Gatus, não o Railway.

**A observabilidade mora em outro projeto Railway.** `transportada-ops` é projeto separado, não
um terceiro ambiente: quem vigia não pode morrer junto com o vigiado. Consequência prática — o
private networking é por projeto, então Vector, `backup` e as apps falam com o stack de ops pelo
**domínio público** dele, com token. Nenhuma porta a mais fica aberta em production.

Custo e risco residual, ditos por extenso:

- **Não é R$ 0.** São ~6 serviços pequenos de compute em `transportada-ops`, mais storage dos
  buckets. É custo de Railway, previsível, e sem cota que expira.
- **Se o Railway inteiro cair, ninguém avisa** — o vigia está lá dentro. Alerta externo de
  verdade exigiria terceiro, e não existe terceiro sempre-grátis. Aceito e escrito.
- **Se o custo apertar, o primeiro a cair é o OpenObserve**, e só a busca some: o arquivo NDJSON
  no bucket continua sendo escrito pelo Vector, e o gate de log continua cumprido.

### D3 — A redação de PII vive no logger, e o logger é um pacote

`@adatechnology/logger@0.0.1` expõe `createLogger`, contexto por `AsyncLocalStorage` e
`fileTransport`. Não expõe nada de redação: `meta` vai para o JSON como veio.

Duas capacidades entram na versão **0.1.0** do pacote, no repositório
`adatechnology-packages` (publicado por GitHub Actions — nunca `npm publish` local):

1. **Redator**, aplicado a `meta` e à mensagem antes de qualquer destino;
2. **Transporte HTTP** assíncrono com batching, para o Vector.

Por que no pacote e não aqui: `AGENTS.md` proíbe criar biblioteca reutilizável neste repositório,
e três apps (`api`, `worker`, `cron`) precisariam de três cópias da mesma regra. A regra de
segurança §1 é literal — "a redação vive no logger, não na disciplina de quem escreve o log".

O redator tem **duas camadas**, porque denylist pura sempre esquece uma chave:

- **por nome de chave** (recursivo, case-insensitive, inclusive dentro de array):
  `cpf`, `cnpj`, `email`, `phone`, `telefone`, `password`, `senha`, `secret`, `token`,
  `authorization`, `cookie`, `certificate`, `certificado`, `pfx`, `xml`, `razaoSocial`,
  `nomeFantasia`, `endereco`, `logradouro`;
- **por forma do valor**, em toda string que sobreviver à primeira camada: CPF, CNPJ, e-mail,
  telefone brasileiro e chave de acesso de 44 dígitos.

O que **não** é redigido, porque é o que resta para correlacionar: identificador opaco
(`companyId`, `correlationId`, `nfeDocumentId`, `batchId`, `messageId`), enum de estado, contagem,
duração, código de erro, `sqlState` e `constraint` (`describeErrorForLog` já é seguro por
construção).

Chave de acesso vira `****` + os seis últimos dígitos: ela carrega o CNPJ do emitente nos
primeiros catorze, e os últimos seis já distinguem dois documentos numa mesma linha de log.

### D4 — Um redator, três destinos

stdout, Vector e GlitchTip recebem o mesmo objeto já redigido. No rastreador de erro isso significa
`sendDefaultPii: false` e um `beforeSend` que passa o evento inteiro — `extra`, `contexts`,
`breadcrumbs` e `request` — pelo mesmo redator do logger. Dois redatores diferentes divergem em
seis meses; um só, não.

SDK `@sentry/bun` na 10.x, apontado para o GlitchTip (D2). `SENTRY_DSN` vazio desliga o SDK
inteiro — é assim que local, CI e teste rodam sem tocar em rede.

Auto-hospedar não afrouxa a redação. O evento sai da app pela internet pública até o host de ops,
e um banco de erros com CPF dentro é vazamento de dado pessoal igual, esteja onde estiver.

### D5 — O backup roda dentro do Railway, não no GitHub Actions

O `financiamento-imobiliario-bot` faz `pg_dump` a partir do GitHub Actions contra a
`DATABASE_PUBLIC_URL`. Isso exige um TCP proxy público no Postgres, e a regra de segurança §5 diz
"banco sem exposição pública; acesso só pela rede interna". Nossos dois bancos de production hoje
**não** têm proxy, e essa é a configuração certa.

Então o backup é um serviço one-shot do próprio projeto Railway, no mesmo formato do `cron` que já
existe (`cronSchedule` + `restartPolicyType: NEVER`, `deploy/backup/railway.json`): fala com os
bancos por `*.railway.internal`, cifra o dump e o envia para o bucket `transportada-backups`, no
projeto `transportada-ops`. O banco nunca fica exposto.

Cinco melhorias sobre o desenho do financiamento:

1. **Destino fora do ambiente.** Lá o dump vai para o mesmo bucket Railway que guarda os uploads
   de produção — backup que morre junto com o que deveria proteger. Aqui vai para bucket de outro
   projeto, com credencial própria: apagar o ambiente `production` inteiro não alcança a cópia.
   O que isso **não** cobre é a perda da conta Railway — daí a cópia manual fora da plataforma,
   descrita em `docs/ops/backup-emergencia.md` e cobrada no critério 11.
2. **Os dois bancos.** O do Keycloak também. Perder o realm é perder o vínculo entre identidade
   externa e membership; o `--import-realm` ignora realm já existente e não reconstrói usuário.
3. **Manifesto verificável.** Cada backup grava, ao lado do `.dump.enc`, um `.sha256` e uma linha
   em `manifest.jsonl` com tamanho, contagem de tabelas e a última migration aplicada. É contra o
   manifesto que o teste de restore compara — sem ele, "restaurou" quer dizer só "não deu erro".
4. **Falha faz barulho.** O ciclo termina empurrando um _external endpoint_ do Gatus, com o token
   em `Authorization: Bearer`. Sem ping na janela declarada no `heartbeat.interval`, alerta. Cron
   que falha em silêncio é backup que não existe e ninguém sabe.
5. **A keyring entra no procedimento.** `ENCRYPTION_KEYRING_JSON` não está no dump e sem ela todo
   certificado A1 restaurado é ruído — ADR-0004: remover uma chave ainda referenciada torna o
   envelope indecifrável. A cópia fora do Railway vira gate, não lembrete.

Cadência: diária, 03:00 BRT (06:00 UTC). Retenção `daily/` 30 dias e `weekly/` (domingo) 90 dias.
RPO de até 24 h, decidido com o responsável pelo produto.

### D6 — O espelho do bucket fiscal nunca apaga

`aws s3 sync` diário do bucket `transportada-production` para `transportada-fiscal-mirror`, no
projeto de ops, **sem `--delete`**. XML
autorizado é imutável (ADR-0006): sumir na origem é anomalia, não intenção, e um espelho que
replica remoção propaga o acidente em vez de protegê-lo dele.

### D7 — Backup que nunca foi restaurado é um arquivo, não um backup

Workflow mensal no GitHub Actions: sobe `postgres:18` como service container, baixa o dump mais
recente do bucket de backup, decifra, `pg_restore`, e **compara com o manifesto** — contagem de
tabelas, hash do
arquivo, e a última migration presente em `__drizzle_migrations`. Divergência falha o job.

Duas travas, porque um restore apontado para o lugar errado é pior que não ter restore:

- o alvo é sempre o service container efêmero, e o job recusa qualquer URL cujo host não seja
  `localhost`;
- o workflow não recebe nenhum secret que dê escrita em production.

### D8 — Aprovação humana só é portão se `main` estiver fechada

_Required reviewers_ no GitHub Environment `production` não bastam sozinhos: o job só existe se
alguém puser commit em `main`. Sem proteção de branch, um push direto pula a revisão de código e
cai direto no portão de deploy com o trabalho já mesclado.

Então são três coisas, e as três são gate: revisor obrigatório no Environment `production`,
proteção de `main` (PR obrigatório, CI verde, sem push direto) e `RAILWAY_TOKEN` como secret **do
Environment** — não do repositório, senão o token de production fica alcançável por um job de
staging.

### D9 — O primeiro deploy de production é em duas passadas

Não é escolha: `docs/spec/railway.md` § Pendências 5 já registra que a instância do serviço só
existe depois do primeiro deploy, e `VITE_*` é inlinado no bundle. Então o domínio do frontend e
do Keycloak só podem ser preenchidos depois de existir, e o frontend precisa de **rebuild** —
restart não troca o que está dentro do bundle.

Antes de tudo isso, o item mais perigoso da lista: **config-as-code por serviço**
(`railway.md` § Pendências 1). Sem o caminho do `railway.json` preenchido na aba _Settings_, o
build cai no Railpack e o `preDeployCommand` não roda — a API sobe **sem aplicar as 9 migrations**,
contra um banco vazio, e todo endpoint responde 500. É o mesmo sintoma já catalogado em staging.
Conferir o campo por serviço é gate, não checklist.

## Histórias priorizadas

### P1 — O operador não perde dado fiscal

**Given** production no ar com CT-e autorizado e XML no bucket
**When** o banco é perdido por completo
**Then** existe um dump cifrado de no máximo 24 h atrás no bucket de backup, o XML está espelhado,
e o procedimento de restauração já foi executado com sucesso pelo menos uma vez.

### P1 — O erro chega a alguém, sem PII junto

**Given** uma exceção não tratada em qualquer das três apps de production
**When** ela sobe até a borda
**Then** um issue aparece no GlitchTip com `errorName`, `sqlState`, `constraint`, `correlationId` e
`companyId` — e nenhum CPF, CNPJ, telefone, e-mail, razão social, chave de acesso completa,
certificado, senha ou XML.

### P2 — Nada publica em production sozinho

**Given** um merge em `main`
**When** o workflow `Deploy` chega no job `deploy`
**Then** ele fica pendente de aprovação de um revisor obrigatório, e o `RAILWAY_TOKEN` usado é o
do Environment `production`.

### P2 — A queda é percebida antes do cliente ligar

**Given** a API de production fora do ar, ou o backup diário que não rodou
**When** passa a janela de checagem
**Then** chega alerta do Gatus, com o monitor identificando qual dos dois caiu.

### P3 — Production nasce com a identidade e a empresa certas

**Given** os seis serviços no ar
**When** o `preDeployCommand` da API roda
**Then** as 9 migrations estão aplicadas, `PROVISION_COMPANY_ID` e `PROVISION_ADMIN_SUBJECT` estão
preenchidos, e o primeiro `company-admin` entra pelo frontend de production e enxerga a empresa.

## Requisitos não funcionais

- **RPO 24 h, RTO 1 h.** O restore completo do banco a partir do bucket de backup cabe em uma
  hora, e o procedimento está escrito com os comandos exatos em `docs/ops/backup-emergencia.md`.
- **Nenhuma assinatura de SaaS, nenhuma cota que expira.** Todo software é open source
  (MIT, MPL-2.0, AGPL-3.0) e roda no Railway. O custo novo é compute e storage do Railway:
  `vector` e `backup` nos ambientes, e o projeto `transportada-ops`. Medido na T018.
- **Nenhum segredo em log, terminal ou artefato de CI.** Segredo que apareceu em log é segredo
  queimado (regra de segurança §4) — inclusive os do próprio backup.
- **O redator não pode custar caro.** Ele roda em todo log; a varredura por forma de valor só
  visita string, com limite de profundidade, e é medida por teste.
- **O Vector fora do ar não derruba a app.** O envio é assíncrono e descarta em silêncio; stdout
  continua sendo a fonte autoritativa.

## Casos extremos e falhas

| Situação                                             | Comportamento esperado                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SENTRY_DSN` vazio                                   | SDK não inicializa; app sobe normal. É o modo de local, CI e teste                             |
| `LOG_SINK_URL` vazio ou Vector fora do ar            | Log só em stdout; nenhum erro, nenhuma exceção, nenhum bloqueio                                |
| GlitchTip fora do ar                                 | SDK descarta o evento; a app não bloqueia nem falha por causa disso                            |
| Stack de ops inteiro fora do ar                      | Log em stdout e retenção do painel do Railway seguem; nenhum alerta chega — risco aceito na D2 |
| `pg_dump` falha                                      | Sai com código diferente de zero, **não** pinga o heartbeat → alerta                           |
| Upload ao bucket de backup falha após um dump válido | Mesma coisa: sem ping, alerta. O dump parcial não fica no destino                              |
| `pg_restore --list` acusa dump corrompido            | O ciclo aborta antes de subir; o backup anterior continua sendo o mais novo                    |
| Teste de restore divergindo do manifesto             | Job falha e abre alerta — é exatamente o que ele existe para pegar                             |
| Config-as-code não preenchido antes do deploy da API | Migration não roda; `assert-migrations` derruba o job antes do worker subir                    |
| Migration de production falha no meio                | `preDeployCommand` falha, o tráfego não troca, rollback é o `.sql` ao lado                     |
| Keyring de production perdida                        | Certificados A1 irrecuperáveis; o procedimento manda recadastrar por empresa                   |
| Redator recebe estrutura cíclica ou muito profunda   | Corta na profundidade máxima e emite `[TRUNCATED]`; nunca lança                                |

## Critérios de aceite

1. `@adatechnology/logger@0.1.0` redige por nome de chave e por forma de valor, com teste cobrindo
   CPF, CNPJ, e-mail, telefone, chave de 44 dígitos, aninhamento em array e estrutura cíclica.
2. Identificador opaco, enum, contagem, duração, `sqlState` e `constraint` atravessam o redator
   intactos — provado por teste, porque uma redação que apaga tudo é tão inútil quanto nenhuma.
3. As três apps de production emitem log estruturado que, pelo Vector, chega ao arquivo NDJSON no
   bucket **e** ao OpenObserve, e nenhuma linha do corpus de teste contém PII.
4. Uma exceção provocada em staging aparece no GlitchTip sem PII, com `correlationId`
   correlacionável com a linha de log correspondente.
5. O serviço `backup` gera dump cifrado dos **dois** bancos, com `.sha256` e linha no
   `manifest.jsonl`, no bucket `transportada-backups`, e pinga o push monitor só quando tudo deu
   certo.
6. O espelho do bucket fiscal roda diariamente e não remove objeto que sumiu na origem.
7. O teste de restore mensal restaura o dump mais recente num Postgres efêmero e confere hash,
   contagem de tabelas e última migration contra o manifesto — e recusa alvo que não seja
   `localhost`.
8. Um restore completo foi executado uma vez à mão, cronometrado, e o tempo está registrado em
   `evidence.md`.
9. O Environment `production` tem revisor obrigatório e `RAILWAY_TOKEN` próprio; `main` exige PR
   com CI verde; um merge em `main` fica pendente de aprovação antes de qualquer chamada ao Railway.
10. Os seis serviços de production estão no ar, com config-as-code preenchido em cada um, e
    `assert-migrations` confirma as 9 migrations aplicadas.
11. `ENCRYPTION_KEYRING_JSON` de production está copiado fora do Railway, e o local está registrado
    em `docs/ops/backup-emergencia.md` — o local, nunca o valor.
12. Monitores do Gatus cobrem `/health/ready` da API, o frontend, o push do backup e o push
    do teste de restore; a queda de cada um foi provocada uma vez e a notificação chegou.
13. O primeiro `company-admin` de production entra pelo frontend e enxerga a empresa provisionada.
14. `docs/spec/railway.md` não tem mais pendência aberta que esta feature fechou, e
    `docs/ops/backup-emergencia.md` existe com os comandos exatos.

## Dúvidas

Nenhuma aberta. As duas decisões de produto foram resolvidas com o usuário: RPO diário com
retenção 30/90 dias, e ferramenta **sempre gratuita ou open source** rodando no Railway — o que
descartou tanto o plano Pro do Railway quanto qualquer free tier de SaaS, e levou ao desenho
Vector + OpenObserve + GlitchTip + Gatus + buckets Railway da D2.
