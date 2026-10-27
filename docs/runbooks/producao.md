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

| Script                                             | O que faz                                                                                  | Tipo              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------- |
| `producao-momentos-prorrogacao.sh`                 | momentos e config dos tipos de ocorrência ativos                                           | leitura           |
| `producao-escopo-prorrogacao.sh`                   | escopo de contratantes do tipo de prorrogação e emitente da NF                             | leitura           |
| `producao-excecoes-prorrogacao.sh`                 | exceções por contratante/destinatário do tipo                                              | leitura           |
| `producao-thiago-vs-andreia.sh`                    | papel e empresa de dois motoristas nas viagens                                             | leitura           |
| `producao-ligar-office-prorrogacao.sh`             | liga o momento `office` no tipo (1 linha, idempotente)                                     | escrita           |
| `trip-stops-check.sh` / `trip-stops-fix-points.sh` | paradas sem coordenada / grava ponto manual (`--confirm`)                                  | leitura / escrita |
| `nfse/nfse-freight-rules-check.sh`                 | regras de frete vigentes e perfis de NFS-e                                                 | leitura           |
| `respostas-rapidas/producao-respostas-rapidas.sh`  | cadastra respostas rápidas só em empresa sem nenhuma                                       | escrita           |
| `cadastro-motorista/producao-motorista-sem-acesso.sh [cpf]` | ficha, usuário, convites e fila de envio de um CPF | leitura |
| `cadastro-motorista/producao-cadastros-sem-acesso.sh` | fichas de motorista sem usuário e convites não aceitos | leitura |
| `cadastro-motorista/producao-dados-para-convidar.sh` | CPF, e-mail e telefone das fichas sem usuário, para convidar | leitura |
| `cadastro-motorista/producao-usuarios-sem-keycloak.sh` | confronta cada usuário do banco com o Keycloak (existe/habilitado) | leitura |
| `notas/producao-faixa-notas.sh [de] [ate]`         | notas existentes/faltando numa faixa e itens de importação sem nota (padrão 914060–918210) | leitura           |

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
ficha e as entregas, **mas não criava convite**: motorista ativo, "Acesso ao app: Sem vínculo" e sem
como entrar (27/10/2026: Rogério, Reinaldo, João Guilherme e Helton). Diagnóstico: rode
`producao-cadastros-sem-acesso.sh`; para ver quem está no banco mas ausente/desabilitado no Keycloak,
`producao-usuarios-sem-keycloak.sh`. Correção manual: convidar com o **CPF igual ao da ficha** (só
dígitos), que liga a ficha ao usuário sozinho. Convite "Convidado" com `expires_at` vencido e
`delivered_at` vazio: usar "Reenviar". A aprovação passou a convidar sozinha (3 tentativas), há
`POST /aggregate-applications/:id/retry-access` para repetir e, na lista de Motoristas, o botão
**Dar acesso** (`POST /fleet/drivers/:id/access`) em toda ficha ativa "Sem vínculo": é o conserto sem
script nem produção.

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
