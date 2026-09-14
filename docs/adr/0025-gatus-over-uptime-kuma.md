# ADR-0025: Uptime e heartbeat no Gatus, com login pelo Keycloak e monitor versionado

## Contexto

A T007 da feature 029 subiu o Uptime Kuma pelo template oficial da Railway. Ao ir ligar os monitores
que a T013 e a T014 exigem, dois problemas apareceram, e nenhum dos dois é detalhe de configuração.

**O painel não fala com o Keycloak.** O produto inteiro autentica por Keycloak — a API, o frontend, e
o GlitchTip pode. O Uptime Kuma não: o mantenedor respondeu na issue
[#6539](https://github.com/louislam/uptime-kuma/issues/6539) que _"oidc is not implemented so far"_, e
o PR [#6232](https://github.com/louislam/uptime-kuma/pull/6232) ("User Management: OpenID support")
foi fechado sem merge — o plano é migrar a autenticação para better-auth antes de tentar de novo. O
que Authelia e authentik documentam como "Uptime Kuma + OIDC" é outra coisa: ou um proxy na frente,
ou o `OAuth2: Client Credentials` que autentica **o monitor** contra um endpoint alheio. Sobra uma
senha local num painel de domínio compartilhado, que é exatamente o que o Chrome sinaliza ao
operador.

**O monitor não é código.** Backup, Vector e teste de restore desta mesma feature são arquivo no
repositório, revisados no pull request que os muda e guardados por contrato. O monitor seria a única
peça do conjunto existindo como estado clicado num formulário: não versionado, não revisável, não
recriável numa instalação nova — e a distribuição é uma instalação por transportadora (ADR-0021),
então "recriável" não é hipótese remota, é o caso comum.

Pôr um `oauth2-proxy` na frente resolveria o login e nenhum dos dois problemas restantes: custaria
mais um serviço por cliente e obrigaria a liberar `/api/push/*` sem autenticação, que é justamente o
endpoint que o backup e o restore chamam.

## Decisão

### 1. O serviço de uptime é o Gatus, e o Uptime Kuma sai

[Gatus](https://github.com/TwiN/gatus) (Apache-2.0) cobre as três necessidades da feature — HTTP,
heartbeat de push e alerta — e resolve os dois problemas acima de origem.

### 2. Login por OIDC do Keycloak, sem senha local

`security.oidc` recebe `issuer-url`, `client-id`, `client-secret` e `redirect-url`; Keycloak está
entre os provedores suportados. Todo valor entra por `${VAR}` do ambiente — o `config.yaml` é
versionado e não guarda segredo. `allowed-subjects` fica de fora: quem controla quem entra é o realm,
não uma segunda lista que envelhece em silêncio.

### 3. O monitor é `deploy/gatus/config.yaml`, embutido na imagem

Mesmo padrão do `deploy/vector`: Dockerfile que copia a configuração para dentro da imagem, sem
volume de configuração e sem painel. Mudar um monitor é abrir pull request, e o
`test/deploy/gatus.contract.ts` falha se um heartbeat perder o alerta ou se um segredo virar literal.

O estado (histórico e eventos) vai para SQLite num volume — dado operacional, não configuração.

### 4. A janela perdida é declaração, não vigilância manual

`external-endpoints[].heartbeat.interval` diz de quanto em quanto tempo o ciclo precisa dar sinal; sem
sinal dentro da janela, o endpoint vira vermelho e o alerta dispara sozinho. `26h` para o backup
diário das 06:00 UTC, `768h` para o restore do dia 5 de cada mês — em ambos, a folga sobre o intervalo
real, que é o que separa alerta de falso positivo por atraso de fila.

Isso troca a prova da T014 de "conferi que o painel avisou" por "o intervalo está no arquivo, e pulei
a janela para vê-lo disparar".

### 5. O push leva token em header, e por isso são duas variáveis

`POST /api/v1/endpoints/<grupo>_<nome>/external?success=true` com `Authorization: Bearer <token>`.
URL e token viajam separados (`BACKUP_HEARTBEAT_URL` + `BACKUP_HEARTBEAT_TOKEN`, e o par equivalente
no restore) porque são coisas diferentes: a URL identifica o monitor, o token autoriza escrever nele.
Ausência de qualquer um dos dois mantém o comportamento que já existia — o backup loga
`backup_heartbeat_disabled` e segue; o workflow de restore falha, porque lá o heartbeat é o passo
final e um restore que não avisa ninguém não vale como teste.

O grupo do endpoint é o **ambiente** (`staging`, `production`): o projeto de ops serve os dois, e
misturar heartbeat de staging com o de production seria o mesmo defeito que o prefixo de ambiente no
bucket já corrigiu.

### 6. O alerta sai por ntfy

Canal gratuito, sem conta e sem infraestrutura nossa; o tópico é aleatório e vive em variável de
ambiente, funcionando como segredo. Trocar por Telegram, Discord ou e-mail é editar o bloco
`alerting` — o Gatus traz mais de trinta provedores, e nenhum deles muda o resto desta decisão.

### 7. OpenObserve fica como está, e isso é escolha

O OpenObserve open source também não tem SSO (é edição Enterprise, gratuita até 50 GB/dia mas de
licença proprietária). Trocá-lo por Grafana + Loki é possível e refaria a T011 e a T012, que já estão
fechadas e funcionando. Fica registrado como pendência pós-lançamento, não como bloqueio: log é dado
que já passou pelo redator, e o painel é o do operador da instalação.

## Consequências

- O Uptime Kuma é removido do projeto `transportada-ops` sem migração de dado: não havia um monitor
  criado. Esta decisão sai barata porque foi tomada antes do primeiro clique — depois de vinte
  monitores, seria outra conversa.
- `deploy/backup/backup.sh` e `.github/workflows/restore-test.yml` passam a mandar `POST` com Bearer
  em vez de `GET` puro; os dois contratos que guardavam o heartbeat acompanham.
- Um monitor novo é uma entrada em YAML, e nasce igual em toda instalação nova — que é o ponto.
- O aviso do Chrome sobre digitar senha em domínio compartilhado desaparece por consequência: não há
  mais senha para digitar no painel.
- A licença do conjunto de observabilidade continua inteiramente open source: Apache-2.0 no lugar de
  MIT.

## Emenda — 14/09/2026: staging sem backup

Staging deixou de ter backup: o serviço `backup` saiu do ambiente, e staging é reposta a partir da
cópia de production pelo `staging-refresh`. Os heartbeats `staging_backup` e `staging_restore` saem
do `config.yaml` — o restore mensal lia `db-backups/staging/`, que não recebe mais ciclo. O §5 segue
valendo para production, que é agora o único grupo com heartbeat de push; o
`.github/workflows/restore-test.yml` precisa apontar para production (`BACKUP_ENVIRONMENT` e o par
`RESTORE_HEARTBEAT_*`).

## Emenda — 14/09/2026: o restore sai do GitHub e roda dentro do Railway

A emenda anterior mandava repontar o workflow para production. Não foi feito, e não será: o teste de
restore de production **não roda em runner hospedado**. O dump decifrado tem dado pessoal e fiscal de
terceiros, e num runner do GitHub ele atravessaria infraestrutura que não é nossa — a mesma razão que
já tinha posto o `staging-refresh` dentro do Railway.

- `.github/workflows/restore-test.yml` foi **removido**. No lugar dele, o serviço cron `restore-test`
  (`deploy/restore-test/`, declarado só em production no `.railway/railway.ts`, `0 7 5 * *`).
- O Postgres que recebe o restore é efêmero, sobe **dentro do contêiner** por `initdb` e só escuta em
  socket Unix. O serviço não recebe URL de banco nenhuma, e recusa rodar se encontrar uma — nem o
  banco de production nem o de staging são tocados.
- O contrato do push do §5 continua o mesmo: `POST` com Bearer no monitor `production_restore`,
  `success=true` só depois do ciclo inteiro, `success=false` na hora em que qualquer passo quebra.
  URL e token passam de secrets do GitHub para variáveis do serviço.
- Os secrets e a variável `BACKUP_ENVIRONMENT` do repositório no GitHub ficam sem consumidor e devem
  ser apagados — a chave de cifra do backup não tem mais razão de existir fora do Railway.
