# Runbook de produção (Railway)

Fonte única de como operar produção. **Toda sessão (humana ou Claude) que for ler, consultar ou
alterar produção lê este arquivo antes e o atualiza depois**, se descobrir um passo novo ou um erro
novo. O que foi tentado e não funcionou entra na seção "Erros que não devem se repetir".

- Projeto Railway: `transportada`, id `62de4c69-216a-4335-93a0-4942c6a95c54`.
- Ambientes: `production` e `staging`. **Toda correção passa por staging primeiro.** Para a `main`
  (produção) vão só bugs críticos, por cherry-pick; o que for direto para a `main` (hotfix) também
  entra em `staging`.
- Serviços: `api`, `worker`, `cron`, `backup`, `restore-test`, `keycloak`, `frontend`, `driver`,
  `gatus` e outros em `deploy/*`.
- Máquina do Anderson: **Arch Linux** (nada de WSL, `/mnt/c` ou `~/personal/transportada` herdado de
  scripts antigos).

## Regras antes de qualquer coisa

1. **Leitura primeiro.** Consulta e log são somente leitura; escrita em produção só com a mudança
   descrita e, quando não for trivial, com simulação antes.
2. **Segredos nunca saem na tela, em log, em PR ou em chat.** Mostre só tamanho e as 3 primeiras
   letras (ver `producao-env-storage.sh` abaixo). Chaves se leem de dentro do script, em variável.
3. **Quando a sessão não consegue sozinha** (sem `railway` logado, sem acesso à produção), ela deixa
   um script `.sh` pronto, com tudo (inclusive o `railway ssh` e a consulta), em
   `/home/miyazaki/Documents/personal/ativada/` e passa só `bash /home/miyazaki/Documents/personal/ativada/<nome>.sh`.
   Nunca passar caminho que não exista na máquina dele.
4. **Scripts não assumem onde o repositório está.** Use `REPO="${REPO:-$(git rev-parse --show-toplevel)}"`
   e aborte com mensagem clara se não achar `.github/scripts/railway-deploy.sh`. Nada de
   `cd "$HOME/personal/transportada"` fixo.
5. **Pré-requisitos na máquina:** `railway` CLI (a CI usa a 4.58.0) logado (`railway whoami`), `bun`
   não é necessário localmente (a consulta roda dentro do container da api), `python3` para mascarar
   variáveis, `git`.

## 1. Ler logs

Somente leitura. Serviços: `api`, `worker`, `cron`, `backup`.

```bash
railway logs -s api -e production --since 30m          # últimos 30 min
railway logs -s worker -e production --since 2h
railway logs -s cron -e production --since 1d
railway logs -s backup -e production --since 1d
railway logs -s api -e production --since "2026-10-26T14:00:00Z"   # a partir de um instante (UTC)
```

- O formato de `--since` é duração (`30m`, `2h`) ou timestamp UTC; para cortar o fim da janela, filtre
  por `awk` no timestamp ISO (ver `logs-staging/staging-logs.sh`, que grava `raw` e `filtrado` por
  serviço, e funciona trocando `ENVIRONMENT="production"`).
- Filtro útil: `grep -Ei '/deliver|/proof|client-diagnostics|conversations|ERROR|error|" ?(4|5)[0-9][0-9] '`.
- Logs do build/deploy de um deployment: `railway deployment list -s api -e production --json` e
  `railway logs -s api -e production --lines 100` (é o que o deploy faz ao falhar).
- Alternativa sem CLI local: ferramenta Railway MCP `get-logs` / `get-deployment-diagnosis`.
- Importação automática (DF-e) saudável: no `worker`, `get-logs` com `filter: distribution` mostra a
  cada ~1h `nfe_distribution_pull_finished`. `status: "rate-limited"` com `fetched: 0` e `ultNsu`
  igual a `maxNsu` significa que a SEFAZ não tem nota nova para o CNPJ; não é falha (conferido em
  26/10/2026, `ultNsu` 54300). Ver também `nfe-distribution.md`.
- Backup e restore: o resultado aparece como monitor `production_restore` no Gatus além do log.

## 2. Consultar o banco de produção

O Postgres **não tem proxy público**. Toda consulta roda **de dentro do container da api**, que
alcança o banco pela rede interna, com `DATABASE_URL` do próprio container.

Modelo (somente leitura):

```bash
railway ssh -s api -e production -- bun -e '
const sql = new Bun.SQL(process.env.DATABASE_URL)
await sql`set transaction read only`.catch(() => {})
console.log(await sql`select id, name from company_occurrence_types where name ilike ${"%prorroga%"}`)
await sql.close()
'
```

Regras que já custaram tempo:

- Aspas: o script do `bun -e` vai entre aspas simples; dentro dele use template literal com
  `${"valor"}` para parâmetros. Para texto com `'`, use `$$...$$` / `$q$...$q$` no SQL.
- Para SQL grande ou que mistura aspas, codifique em base64 e decodifique no container (padrão de
  `nfse/nfse-freight-rules-check.sh`): `railway ssh ... -- sh -c "echo $ENCODED | base64 -d > /tmp/x.mjs && bun /tmp/x.mjs; rm -f /tmp/x.mjs"`
  e imprima o resultado com prefixo (`__RESULT__`) para filtrar ruído do ssh com `grep`.
- Termine com `await sql.close()` (ou `process.exit(0)`), senão o `ssh` pendura.
- **Escrita**: faça em `sql.begin(async (tx) => ...)`, imprima ANTES e DEPOIS, e dê um modo
  simulação por padrão com `--confirm` para gravar (modelo: `trip-stops-fix-points.sh`). Prefira
  `insert ... on conflict do nothing` (idempotente), como em `producao-ligar-office-prorrogacao.sh`.
- Se o `railway` não estiver linkado ao projeto: passe `-p 62de4c69-216a-4335-93a0-4942c6a95c54`
  (`railway ssh -p <id> -s api -e production ...`).
- Consultas já prontas e testadas (cópias no projeto Claude, pasta `prorrogacao/`):

| Script                                                      | O que faz                                                                                  | Tipo              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| `producao-momentos-prorrogacao.sh`                          | momentos e config dos tipos de ocorrência ativos                                           | leitura           |
| `producao-escopo-prorrogacao.sh`                            | escopo de contratantes do tipo de prorrogação e emitente da NF                             | leitura           |
| `producao-excecoes-prorrogacao.sh`                          | exceções por contratante/destinatário do tipo                                              | leitura           |
| `producao-thiago-vs-andreia.sh`                             | papel e empresa de dois motoristas nas viagens                                             | leitura           |
| `producao-ligar-office-prorrogacao.sh`                      | liga o momento `office` no tipo (1 linha, idempotente)                                     | escrita           |
| `trip-stops-check.sh` / `trip-stops-fix-points.sh`          | paradas sem coordenada / grava ponto manual (`--confirm`)                                  | leitura / escrita |
| `nfse/nfse-freight-rules-check.sh`                          | regras de frete vigentes e perfis de NFS-e                                                 | leitura           |
| `respostas-rapidas/producao-respostas-rapidas.sh`           | cadastra respostas rápidas só em empresa sem nenhuma                                       | escrita           |
| `cadastro-motorista/producao-motorista-sem-acesso.sh [cpf]` | ficha, usuário, convites e fila de envio de um CPF                                         | leitura           |
| `cadastro-motorista/producao-cadastros-sem-acesso.sh`       | fichas de motorista sem usuário e convites não aceitos                                     | leitura           |
| `cadastro-motorista/producao-dados-para-convidar.sh`        | CPF, e-mail e telefone das fichas sem usuário, para convidar                               | leitura           |
| `cadastro-motorista/producao-usuarios-sem-keycloak.sh`      | confronta cada usuário do banco com o Keycloak (existe/habilitado)                         | leitura           |
| `notas/producao-faixa-notas.sh [de] [ate]`                  | notas existentes/faltando numa faixa e itens de importação sem nota (padrão 914060–918210) | leitura           |

Quando uma consulta nova for útil mais de uma vez, copie-a para `scripts/ops/` neste repositório.

## 3. Variáveis (conferir e trocar)

### Conferir (sem vazar segredo)

```bash
railway variables -s api -e production --json | python3 -c '
import json, re, sys
data = json.load(sys.stdin)
for key in sorted(data):
    if not re.match(r"^(OBJECT_STORAGE|STORAGE)_", key):
        continue
    value = str(data[key])
    visible = re.search(r"(ENDPOINT|BUCKET|REGION|FORCE_PATH|MAX_OBJECT)", key)
    shown = value if visible else f"{value[:3]}...(len={len(value)})"
    kind = "REFERENCIA" if "${{" in value else "texto"
    print(f"{key} [{kind}] = {shown}")
'
```

Rode para `api`, `worker` e `cron` (e `BACKUP_S3_*` em `backup` e `restore-test`, que leem o bucket de
ops). Atenção ao `[texto]` onde deveria ser `[REFERENCIA]`: é o sinal de chave colada à mão.

### Trocar

- **Prefira referências ao bucket do Railway a chaves coladas**, para nome (que tem hash), chaves,
  endpoint e região acompanharem o bucket de verdade:

```bash
BUCKET_SERVICE="transportada-production"
for service in api worker; do
  railway variables -s "$service" -e production \
    --set 'OBJECT_STORAGE_ACCESS_KEY=${{'"$BUCKET_SERVICE"'.ACCESS_KEY_ID}}' \
    --set 'OBJECT_STORAGE_SECRET_KEY=${{'"$BUCKET_SERVICE"'.SECRET_ACCESS_KEY}}' \
    --set 'OBJECT_STORAGE_BUCKET=${{'"$BUCKET_SERVICE"'.BUCKET}}' \
    --set 'OBJECT_STORAGE_ENDPOINT=${{'"$BUCKET_SERVICE"'.ENDPOINT}}' \
    --set 'OBJECT_STORAGE_REGION=${{'"$BUCKET_SERVICE"'.REGION}}'
done
```

(aspas simples no `--set` para o shell não expandir `${{ }}`.)

- `OBJECT_STORAGE_FORCE_PATH_STYLE=false` é necessário: o endpoint é virtual-host
  (ver `docs/spec/railway.md`).
- Se for inevitável gravar chave literal: peça cada valor com `read -rs`, recuse vazio/espaço/quebra
  de linha **antes** de gravar, recuse se access key == secret, e faça `unset` ao final
  (modelo: `producao-corrige-chaves-bucket-v2.sh`). Nunca em argumento de linha de comando visível
  no histórico, nem em arquivo.
- Mudar variável redeploya o serviço (ou fica pendente, conforme o painel). Em seguida: seção 4 se o
  redeploy não vier, e seção 5 para testar. `worker` e `cron` também leem as variáveis.
- `railway variables ... --skip-deploys` grava sem redeploy (o `railway-deploy.sh` usa para
  `DEPLOYED_REVISION`).

### Flag da trava de uma viagem por vez (prorrogação do motorista)

Só o serviço `api` lê. Padrão desligada; o escritório nunca é travado.

```bash
# ligar (corte de nota 70; ajuste o número se quiser outro)
railway variables -s api -e production --set DRIVER_TRIP_LOCK_ENABLED=true --set DRIVER_TRIP_LOCK_MIN_SCORE=70
# desligar
railway variables -s api -e production --set DRIVER_TRIP_LOCK_ENABLED=false
```

Efeito (API reinicia ao mudar a variável): com `true`, o motorista com outra viagem mais antiga na rua
e nota abaixo do corte (ou sem nota) recebe `409 DRIVER_TRIP_LOCKED` ao pedir "Cliente pediu prorrogação
do boleto" numa viagem que não é a atual. Entra primeiro em staging; produção só com aval do Anderson.

## 4. Redeploy e reinício

Ordem de preferência:

1. **Pelo workflow (caminho normal).** Push em `staging` publica staging; push em `main` publica
   produção. Manual: Actions > Deploy > _Run workflow_ com `environment=production`
   (`force_all` publica todos os serviços). Ordem interna: `gate` → `deploy-api` (migrations no
   pré-deploy) → `worker`/`cron` → frontends. **A api sempre sobe antes de quem depende dela.**
2. **`railway redeploy`** (reinicia o último deployment, sem rebuild):
   `railway redeploy -s api -e production -y`. **Falha se o deployment mais recente não puder ser
   reaproveitado** (deploy antigo/removido): a CLI recusa. Não insista; vá para o 3.
3. **`railway up` pela CLI** (rebuilda e publica a árvore local; é o mesmo comando do `deploy.yml`).
   Só a partir de uma cópia **limpa e idêntica à `origin/main`**:

```bash
REPO="${REPO:-$(git rev-parse --show-toplevel)}"
[ -f "$REPO/.github/scripts/railway-deploy.sh" ] || { echo "rode dentro do repositório" >&2; exit 1; }
cd "$REPO"
git fetch origin main --quiet
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "HEAD != origin/main: git checkout main && git pull" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "alterações locais não commitadas" >&2; exit 1; }
for service in api worker; do
  railway up --ci --service "$service" --environment production \
    --project 62de4c69-216a-4335-93a0-4942c6a95c54 --message "motivo-curto"
done
```

A api roda as migrations no pré-deploy; com a `main` já em produção elas não têm o que aplicar.
`railway up --ci` pode sair com erro ao perder o streaming do build mesmo com o deployment
criado: **o status do deployment é quem decide**
(`railway deployment list -s api -e production --json`). 4. **Painel**: Deploy no serviço (api e worker), quando a CLI não aceita.

Depois de qualquer redeploy: `railway deployment list -s <serviço> -e production --json` até
`SUCCESS` estável e `curl -s https://api.fernandes-transportadora.com.br/health/ready` com `migrations: up`
(ou `bash /home/miyazaki/Documents/personal/ativada/producao-health-ready.sh`).

### Deploy travado (job sem runner)

Sintoma: merge entrou e o deploy não rodou; runs seguintes `pending` com zero jobs. Causa: job
`queued` sem runner (lado do GitHub), a concorrência por branch segura os demais.

```bash
gh run list --workflow Deploy --limit 5
gh run cancel <id>
gh api -X POST repos/Andersonfrfilho/transportada/actions/runs/<id>/force-cancel   # se seguir queued
gh workflow run Deploy -f environment=production    # só se for o commit mais novo
```

O `deploy-watchdog.yml` (10 em 10 min) já faz isso após 20 min. **Nunca cancele run com job
`in_progress`**: deixa os serviços em versões diferentes. Se não puder esperar, publique pela CLI
(item 3).

### Deploy falha em "Invalid RAILWAY_TOKEN" (token inválido)

Sintoma: o gate passa e todos os jobs `deploy-*` caem no primeiro passo da CLI com token inválido
ou não autorizado. Nada foi publicado (26/10/2026: o merge da #349 na main ficou sem subir).
O `RAILWAY_TOKEN` é secret **do ambiente** do GitHub (`production` / `staging`), não do repositório.

1. Railway → projeto → Settings → Tokens: gerar um _Project Token_ do ambiente `production`.
2. GitHub → Settings → Environments → `production` → Secrets → atualizar `RAILWAY_TOKEN`.
   Atalho: `bash /home/miyazaki/Documents/personal/ativada/railway-define-tokens.sh` pede cada token
   sem eco, confere no Railway (projeto e ambiente certos) antes de gravar com `gh secret set --env`
   e refaz o run de produção. Enter vazio pula o ambiente.
3. Refazer o run que falhou: `gh run rerun <id> --failed` (mantém o commit; o gate não roda de novo).
4. Sem token à mão: `bash producao-reinicia-via-cli.sh` publica **só api e worker** (`railway up`,
   nessa ordem) a partir da main local. Front-end, driver, client e landing só sobem pelo workflow.
5. Confirmar: `curl -s https://<domínio-da-api>/health/ready` com `migrations: up`. O Gatus não está
   no `deploy.yml`; se ele mudou junto, publique-o depois da api (seção abaixo).

### Ordem de publicação: API antes do Gatus

O Gatus monitora a API: publique a **api** (e confirme `health/ready`) antes de publicar/alterar o
**gatus** (`deploy/gatus`), senão o monitor novo nasce vermelho contra uma api ainda velha, ou
aponta para endpoint que ainda não existe. Alterou os monitores junto com uma mudança da api:
api primeiro, confere saúde, depois gatus. _(Regra recebida do Anderson; o `deploy.yml` hoje só
codifica api → worker/cron — se o gatus entrar no pipeline, registrar aqui.)_

## 5. Testar o bucket

Dois testes, ambos só leitura e sem imprimir segredo, de dentro do container da api:

- `producao-testa-bucket.sh`: mostra host do endpoint, nome do bucket, presença das chaves e faz
  `list` (maxKeys 3) com `Bun.S3Client` + `HEAD` no endpoint.
- `producao-testa-bucket-como-a-api.sh`: usa o **mesmo cliente da API**
  (`@adatechnology/object-storage-provider`, `provider.health()`) e a mesma configuração. Este é o
  que vale: o primeiro passou algumas vezes enquanto a API falhava.

`LIST FALHOU` com `InvalidAccessKeyId`/`SignatureDoesNotMatch` = chaves não batem com o bucket
(ver erros abaixo). `ENDPOINT INALCANÇÁVEL` = endpoint/rede.

## 5.1 Conferir o envio de email de uma ocorrência (Resend)

Somente leitura, sem precisar de `railway` logado. Pela ferramenta Resend MCP (a conta de produção
envia por `nao-responda@fernandes-transportadora.com.br`, via Amazon SES `sa-east-1`):

1. `list-emails` (mais recentes primeiro): cada ocorrência gera **1 email ao contratante** (assunto
   do modelo, ex. `... — Pedido de prorrogação do boleto — NF <número>`) e **1 aviso interno por
   usuário da equipe** (`Ocorrência na entrega da nota <número>`), todos com o mesmo horário.
2. `get-email` no email do contratante: confira `To` (contratante), `CC` (equipe), `Reply-To`
   (endereço `@resposta.fernandes-transportadora.com.br` da conversa), texto do modelo e `Status`
   (`delivered`; `bounced`/`complained`/`delivery_delayed` pedem investigação).
3. `list-sent-email-attachments`: o pedido de prorrogação leva **só o `logo.png`** (cid do cabeçalho);
   não leva boleto, porque o boleto novo vem da contratante. Ocorrências com PDF/foto devem listar o
   arquivo; ausência indica falha de leitura do bucket (ver seção 5).
4. Se algo estiver errado, cruze com `railway logs -s worker -e production` (seção 1) no horário do
   envio e com a ocorrência no banco (seção 2).

Verificado em 26/10/2026 com a NF 914063/2 (Spani): entregue, destinatários e anexo corretos.

## 5.2 Motorista sem acesso ao app ("Sem vínculo")

O app do motorista autentica só pelo Keycloak, e o usuário de lá só nasce pelo **convite** (Usuários

> Convidar usuário, ou o cadastro manual em Motoristas). Candidatura de agregado aprovada gravava a
> ficha e as entregas, **mas não criava convite**: motorista ativo, "Acesso ao app: Sem vínculo" e sem
> como entrar (27/10/2026: Rogério, Reinaldo, João Guilherme e Helton). Diagnóstico: rode
> `producao-cadastros-sem-acesso.sh`; para ver quem está no banco mas ausente/desabilitado no Keycloak,
> `producao-usuarios-sem-keycloak.sh`. Correção manual: convidar com o **CPF igual ao da ficha** (só
> dígitos), que liga a ficha ao usuário sozinho. Convite "Convidado" com `expires_at` vencido e
> `delivered_at` vazio: usar "Reenviar". A aprovação passou a convidar sozinha (3 tentativas), há
> `POST /aggregate-applications/:id/retry-access` para repetir e, na lista de Motoristas, o botão
> **Dar acesso** (`POST /fleet/drivers/:id/access`) em toda ficha ativa "Sem vínculo": é o conserto sem
> script nem produção. A conferência **Cadastros e acessos** (Usuários) também lista, abaixo da tabela,
> toda ficha ativa que ainda não entra no app (`GET /fleet/drivers/access-report`: sem convite, convite
> não usado ou vencido), com **Dar acesso** / **Reenviar convite** na própria linha; vazio = todo
> motorista ativo já tem acesso.

## 5.3 Promoção staging → main com a spec 281 (WhatsApp pelo Evolution)

Promoção de 27/10/2026 (PRs #377 a #387, #389, #391, parada por página #378). O que conferir:

- **Migrations aditivas**, aplicadas no pré-deploy da api: `delivery_client_emails` vira
  `delivery_client_contacts` (renomeada, com canal e visão `delivery_client_emails` para a api e o worker
  antigos durante a troca de imagens), `whatsapp_evolution_settings` (tabela nova), colunas novas em
  `occurrence_contractor_reply_deliveries` e `company_occurrence_types`. Conferir depois do deploy
  `/health/ready` com `migrations: up`. A visão sai numa migration futura.
- **WhatsApp pelo Evolution nasce desligado em produção.** Sem variável nova: a chave da instância vai
  selada no banco (mesmo envelope do canal da Meta). Sem linha em `whatsapp_evolution_settings`, ou com
  `status = 'disabled'`, nada é enviado; o padrão do tipo de ocorrência é `client_channel = 'email'`
  (o que a 279 faz não muda). Ligar só com aval do Anderson, empresa por empresa, e só depois de um
  Evolution real testado em staging (o serviço de staging ainda não subiu).
- Não há serviço Evolution em produção; nenhuma ação de infraestrutura na promoção.

**Resultado (28/10/2026):** `staging` → `main` pelo PR #397 (merge 4538804), deploy de produção verde
(api, worker, cron, frontends) com `migrations` aplicadas. Dois avisos da promoção:

- O deploy de **staging** parou em `Reconciliar realm` (`keycloak-reconcile.sh`): o service account
  `transportada-admin` de staging estava só com `manage-realm` e `manage-users`; o script exige
  `view-clients` e `manage-clients` de `realm-management`. O script é o mesmo da `main` e produção
  passou nele; em staging é preciso conceder os dois papéis no console do Keycloak de staging e
  reexecutar o deploy. Enquanto isso, o `Deploy API` de staging fica pulado.
- Os serviços `osrm` e `map-tiles` de staging reportam `Deployment failed` pela integração do Railway
  (não fazem parte da diferença da promoção e não são checks exigidos).
- Push em `staging` durante a promoção cancela o gate em andamento (um por commit); combine antes de
  mergear outras coisas na staging.

## 5.4 Próxima promoção staging → main: conversa do cliente (spec 283) e Evolution

Conferido em 28/10/2026 (revisão de `main...staging`: PRs #388, #398, #399, #400, #401, #402, #403, #404, #405, #372, #396).

- **Uma migration nova, aditiva:** `20261027232931_occurrence_client_conversation` (colunas nulas
  `client_delivery_id`, `recipient_address`, `client_tax_id`, índice único parcial, CHECKs que só aceitam mais e o
  gatilho `occurrence_client_conversation_sync_trigger` em `occurrence_contractor_reply_deliveries`, que nunca derruba o
  envio). Tem `rollback.sql`. Depois do deploy, `/health/ready` com `migrations: up`.
- **Sem variável nova em produção.** `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY` são opcionais e só existem em
  staging; sem elas a tela de WhatsApp não oferece "Criar e conectar" (`provisioningAvailable: false`). Não criar essas
  variáveis em produção sem aprovação do Anderson.
- **WhatsApp continua desligado:** `whatsapp_evolution_settings.status` nasce `disabled`, `default_provider` nasce
  `meta`, `client_channel` do tipo nasce `email`. A conversa do cliente (283) nasce no primeiro envio por e-mail ou
  WhatsApp ao cliente, então em produção ela passa a aparecer já para os envios por e-mail (279).
- **Realm do Keycloak:** `deploy/keycloak/realm.json` agora concede `view-clients` e `manage-clients` ao service
  account; produção já passa no `keycloak-reconcile.sh`, nada a fazer lá.
- **Staging (não bloqueia a promoção):** usuários do Keycloak de staging foram perdidos no incidente de 27/10 (voltam no
  próximo `staging-refresh`); `osrm` e `map-tiles` de staging não rebuildam (o `wget` sumiu da imagem base
  `planetiler:latest`).
- **Pendências do Anderson antes de ligar WhatsApp em qualquer ambiente:** testar o "Criar e conectar" com o Evolution real de staging (o ADR 0112 já foi aceito em 28/10).

**Resultado (28/10/2026, segunda promoção do dia):** PR #408 (merge 9b1761a). O deploy de produção ficou verde só na
terceira tentativa dos jobs que falharam. As duas primeiras caíram em "Reconciliar realm" com `curl 502`: o Keycloak
era redeployado e o reconcile pedia o token antes de ele terminar de subir (o log mostrava JGroups tentando falar com
o nó antigo). Na terceira, com o Keycloak já estável (script de saúde: discovery 200, certs 200, token 401), passaram
`deploy-api` (incluindo "Conferir migrations aplicadas" e "Conferir as origens do frontend"), `deploy-services`
(worker e cron), `deploy-frontend`, `deploy-driver` e `mark-deployed`. Correção pendente: o `keycloak-reconcile.sh`
deve esperar o Keycloak responder antes de pedir o token.

### Keycloak de produção: checar a saúde (somente leitura)

Script `producao-keycloak-saude.sh` (na pasta `ativada` do Anderson, fora do repositório): mostra os deploys e as
últimas 80 linhas de log do `keycloak`, e testa o discovery do realm, os certificados e o endpoint de token **sem
credencial** (200 e 400/401 = de pé; 502/503 = fora do ar). Não troca variável nem redeploya.

Caso de 28/10/2026 (promoção #408): `deploy-api` falhou duas vezes em "Reconciliar realm" com `curl 502` logo depois
de "Deploy identity" dar sucesso. O passo de deploy só espera o Railway marcar `SUCCESS`; o `keycloak-reconcile.sh`
não espera o Keycloak responder. Nesse caso a API, o worker e os frontends **não** sobem (os jobs seguintes ficam
pulados) e as migrations não rodam. Não insistir em re-run: ler o log do `keycloak` primeiro.

## 6. Erros que não devem se repetir

| Erro                                                                                                             | Como evitar                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Script com caminho do repositório fixo (`$HOME/personal/transportada`, `/mnt/c/...`), que não existia na máquina | `REPO="${REPO:-$(git rev-parse --show-toplevel)}"`, validar o arquivo-sentinela, abortar com mensagem. Máquina é Arch Linux               |
| `main` local desatualizada ao publicar com `railway up`                                                          | O script compara `HEAD` com `origin/main` e aborta; `git checkout main && git pull` antes                                                 |
| Chaves `OBJECT_STORAGE_*` coladas à mão que **não batiam com o bucket** (e o nome do bucket tem hash)            | Usar referências `${{transportada-production.X}}`; conferir `[texto]` vs `[REFERENCIA]`; testar com `producao-testa-bucket-como-a-api.sh` |
| Colar duas chaves de uma vez / com espaço ou quebra de linha                                                     | Pedir uma por vez, recusar espaço e vazio antes de gravar (v2 do script)                                                                  |
| `railway redeploy` recusado por deploy antigo                                                                    | Cair para `railway up` (item 3) ou painel; não repetir o redeploy                                                                         |
| Achar que o redeploy já aplicou as variáveis                                                                     | Esperar `SUCCESS` estável e re-testar o bucket                                                                                            |
| Deploy não rodou após o merge                                                                                    | Ver "Deploy travado"; checar Actions antes de supor que subiu                                                                             |
| Publicar gatus antes da api                                                                                      | Ordem acima                                                                                                                               |
| Scripts em Windows/WSL, `zsh` ou com `nvm` fixo                                                                  | Máquina é Arch; `#!/usr/bin/env bash` e `command -v railway`                                                                              |

## 7. Manutenção deste runbook

- Passo novo, comando que mudou ou erro novo em produção → atualize este arquivo **no mesmo PR** ou
  num PR de docs logo em seguida.
- Documentação não é bug crítico: vai para `staging` e sobe para a `main` na próxima promoção, salvo
  pedido do Anderson.

## Incidente de staging em 27/10/2026: `railway config apply` apagou o banco do Keycloak

⚠️ **Nunca rode `railway config apply` sem ler o plano inteiro e sem `0 to destroy` para o que não é seu.**
O apply de uma branch trabalhando no Evolution (PR #388) executou o plano completo do `.railway/railway.ts`,
não só a criação dos serviços novos: apagou o serviço `Postgres-keycloak` (banco do Keycloak de staging, com
o volume), 3 variáveis do worker (`KEYCLOAK_TOKEN_URL`, `WORKER_CLIENT_ID`, `WORKER_CLIENT_SECRET`) e 26 do
`evolution-api`, e criou um `Postgres-q0RQ` vazio. O Keycloak de staging caiu (`connection to localhost:5432
refused`). Produção não foi tocada.

Causas: (1) variável não declarada no `env` de um serviço é tratada como "a apagar" (`variables: managed`);
(2) serviço não declarado no arquivo é apagado; (3) o script de apoio perguntava "só cria?" e aplicava o que o
plano trouxesse; (4) o plano mostrou 32 destruições e a confirmação foi dada mesmo assim.

Recuperação (só variáveis, sem apply): `KC_DB_URL/USERNAME/PASSWORD` do `keycloak` por referência ao
`Postgres-q0RQ` (o `--import-realm` recria o realm `transportada` em banco vazio); segredo novo
`KEYCLOAK_WORKER_CLIENT_SECRET` no `keycloak`, referenciado como `WORKER_CLIENT_SECRET` no worker;
variáveis do `evolution-api` restauradas. **Perdidos:** usuários e sessões do Keycloak de staging, até o
próximo `staging-refresh`.

Nota: o apply também gravou `NFSE_PROVIDER_API_VERSION=v3` no `api` de staging. Está certo: o Anderson
confirmou em 28/10 que produção já usa `v3`, e o `railway.ts` declara `v3` nos dois ambientes.

Regra daqui para frente: apply só depois de `railway config plan` com **nenhum** `Delete`; toda variável
existente de serviço gerenciado entra no arquivo como `preserve()`; script que aplica não vai para a pasta
`ativada`.

### Evolution em staging: variáveis do `api` (28/10/2026)

O `api` de staging recebe `EVOLUTION_BASE_URL=http://evolution-api.railway.internal:8080` e
`EVOLUTION_GLOBAL_API_KEY=${{evolution-api.AUTHENTICATION_API_KEY}}` (referência: a chave global nunca é
copiada nem impressa). A API cria a instância pelo portal (PR #404); o script
`evolution-staging-instancia.sh` não é mais necessário. As duas variáveis constam no `railway.ts` como
`preserve()` para um apply não as apagar.

### Plano de produção contra o `railway.ts` (28/10/2026, somente leitura)

`railway config plan` de produção contra a staging `cba0044` (já com os nomes de banco do #410): **0 serviços ou
bancos apagados**, 16 mudanças e **1 `Delete`**: a variável `api.TURNSTILE_SECRET_KEY`, que existe em produção e
a API lê, mas não estava no arquivo. Ela entrou como `preserve()`; o plano seguinte deve dar zero `Delete`.
As demais mudanças são aditivas: `restartPolicyType: ON_FAILURE` nos serviços, `drainingSeconds: 600` no
worker e seis variáveis `AUDIO_TRANSCRIPTION_*` do worker. **Nenhum apply foi rodado**; ele segue
dependendo de novo plano sem `Delete` e da aprovação do Anderson.

### Recuperação dos usuários de staging (28/10/2026)

O banco do Keycloak de staging foi apagado em 27/10 (ver incidente acima); o realm voltou sem usuários.
Recuperação feita por scripts em `ativada/`, todos **somente staging** (produção só lida, nunca escrita,
nunca imprime hash) e sem `railway config apply`:

1. `staging-recriar-usuarios.sh`: lê de staging quem tinha identidade no issuer, mostra a lista, cria as
   contas no realm (sem senha), copia hash e histórico de senha (`credential`) do Keycloak de produção
   casando por username, religa `external_identities` e reinicia o Keycloak.
2. `staging-renomear-usuarios-uuid.sh`: troca username em UUID por `nome.sobrenome` com a regra do convite
   (`generated-username.policy.ts`: sobrenomes anteriores, depois sufixo 2..99). `sub`, memberships e papéis
   não mudam; só o login.
3. `staging-corrigir-conferencia.sh`: recopia senha pelo username atual, apaga `external_identities` cujo
   `sub` não existe mais no Keycloak, religa a conta de serviço do worker.
4. `staging-fechar-pendencias.sh`: casa contas sem senha com a de produção por e-mail/CPF.
5. `staging-criar-automation.sh`: cria a pessoa sintética `automation` (ADR-0047) em cada empresa ativa de
   staging e liga a conta de serviço do worker. **Produção tem 0 memberships `automation`**: confirmar se as
   rotinas que chamam a API pelo worker (MDF-e automático, baixa por WhatsApp, canhoto, e-mail de ocorrência)
   estão ligadas lá antes de criar.
6. `staging-conferir-usuarios.sh`: só leitura; confere existência, `sub`, `company_id`, senha igual à de
   produção (md5 do hash) e a conta de serviço. Rodar antes de qualquer passo em produção.

Pegadinhas: o token do admin do `master` dura 60 s (renovar a cada etapa); o arquivo copiado por
`device_commit_files` pode chegar defasado, conferir `md5sum`; o Keycloak guarda a senha como hash, então "mesma
senha" só se obtém copiando `credential`, nunca digitando. Contas sem usuário correspondente em produção
(convidadas que nunca definiram senha, contas de teste) ficam sem senha em staging.

### Pessoa `automation` criada em produção (28/10/2026)

Antes: 0 memberships com o papel `automation` em produção (nem em staging), então as rotinas do worker que
chamam a API (MDF-e automático, baixa por WhatsApp, canhoto, e-mail automático de ocorrência) não tinham quem
as autorizasse (ADR-0047). Rodado pelo Anderson: `producao-criar-automation.sh` (mostra o plano e exige
digitar `producao`). Criou o `identity_user` sintético `18152f2a-d903-4a71-8b2f-4fb6783c658a`, a membership
`automation` na única empresa ativa (`ce523659-5e30-4b13-96ce-8d603d8cb9e9`) e o vínculo
`external_identities` com a conta de serviço do worker (`sub` `0c5fe9dc-d869-459e-b1ca-3161980f17d9`). Só
INSERT no banco do app; Keycloak intocado. Reverter: apagar essa membership e o vínculo.

`producao-renomear-usuarios-uuid.sh` rodou no mesmo dia e não achou nenhum username em UUID em
`identity_user_profiles` de produção: nada foi alterado. (Os UUIDs vistos eram só de staging.)
