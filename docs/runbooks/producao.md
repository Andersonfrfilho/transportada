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
   `/home/miyazaki/Documents/personal/transportada/tmp/ops/` e passa só `bash /home/miyazaki/Documents/personal/transportada/tmp/ops/<nome>.sh`.
   Nunca passar caminho que não exista na máquina dele.
   **Saída grande vai para arquivo**: o script grava a saída completa em
   `/home/miyazaki/Documents/personal/transportada/tmp/ops/saidas/<nome>-<data>.json` e imprime só o caminho, para o Anderson não
   copiar logs; a sessão lê o arquivo direto (`device_stage_files`).
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

| Script                                                                  | O que faz                                                                                                                                                                                                                                                                                                                                                                                                                                       | Tipo                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `producao-momentos-prorrogacao.sh`                                      | momentos e config dos tipos de ocorrência ativos                                                                                                                                                                                                                                                                                                                                                                                                | leitura                         |
| `producao-escopo-prorrogacao.sh`                                        | escopo de contratantes do tipo de prorrogação e emitente da NF                                                                                                                                                                                                                                                                                                                                                                                  | leitura                         |
| `producao-excecoes-prorrogacao.sh`                                      | exceções por contratante/destinatário do tipo                                                                                                                                                                                                                                                                                                                                                                                                   | leitura                         |
| `producao-thiago-vs-andreia.sh`                                         | papel e empresa de dois motoristas nas viagens                                                                                                                                                                                                                                                                                                                                                                                                  | leitura                         |
| `producao-ligar-office-prorrogacao.sh`                                  | liga o momento `office` no tipo (1 linha, idempotente)                                                                                                                                                                                                                                                                                                                                                                                          | escrita                         |
| `producao-publicar-modelo-correcao-endereco.sh [--confirm]`             | descobre a empresa e publica `correcao-endereco.padrao` no módulo de notificação (spec 286); sem `--confirm` só mostra o plano; `ENV_NAME=production` só com aprovação                                                                                                                                                                                                                                                                          | escrita (idempotente por chave) |
| `producao-publicar-falas-do-bot.sh [--confirm] [--overwrite-nodes a,b]` | republica o grafo raiz do WhatsApp (`scripts/whatsapp-flow-publish.ts`, spec 286 T8) para os nós `fala_*` do bot existirem no editor de fluxos; sem `--confirm` só mostra o diff; preserva as falas já editadas, exceto as chaves de `--overwrite-nodes fala_x,fala_y` (texto do código; o diff lista "nós sobrescritos" antes/depois; chave inexistente aborta); histórico gravado antes de substituir; `ENV_NAME=production` só com aprovação | escrita (idempotente)           |
| `trip-stops-check.sh` / `trip-stops-fix-points.sh`                      | paradas sem coordenada / grava ponto manual (`--confirm`)                                                                                                                                                                                                                                                                                                                                                                                       | leitura / escrita               |
| `nfse/nfse-freight-rules-check.sh`                                      | regras de frete vigentes e perfis de NFS-e                                                                                                                                                                                                                                                                                                                                                                                                      | leitura                         |
| `respostas-rapidas/producao-respostas-rapidas.sh`                       | cadastra respostas rápidas só em empresa sem nenhuma                                                                                                                                                                                                                                                                                                                                                                                            | escrita                         |
| `cadastro-motorista/producao-motorista-sem-acesso.sh [cpf]`             | ficha, usuário, convites e fila de envio de um CPF                                                                                                                                                                                                                                                                                                                                                                                              | leitura                         |
| `cadastro-motorista/producao-cadastros-sem-acesso.sh`                   | fichas de motorista sem usuário e convites não aceitos                                                                                                                                                                                                                                                                                                                                                                                          | leitura                         |
| `cadastro-motorista/producao-dados-para-convidar.sh`                    | CPF, e-mail e telefone das fichas sem usuário, para convidar                                                                                                                                                                                                                                                                                                                                                                                    | leitura                         |
| `cadastro-motorista/producao-usuarios-sem-keycloak.sh`                  | confronta cada usuário do banco com o Keycloak (existe/habilitado)                                                                                                                                                                                                                                                                                                                                                                              | leitura                         |
| `notas/producao-faixa-notas.sh [de] [ate]`                              | notas existentes/faltando numa faixa e itens de importação sem nota (padrão 914060–918210)                                                                                                                                                                                                                                                                                                                                                      | leitura                         |
| `certificado/producao-certificado-validade.sh`                          | validade dos certificados A1, execuções com `certificate_expired` e auditoria                                                                                                                                                                                                                                                                                                                                                                   | leitura                         |
| `ops/producao-devolucao-notas.sh`                                       | vínculos, status da viagem e eventos de uma lista de NFs (03/11/2026)                                                                                                                                                                                                                                                                                                                                                                           | leitura                         |
| `ops/producao-soltar-notas-devolvidas.sh [--confirm]`                   | solta (`released_at`) NFs devolvidas pelo escritório para entrarem em outra viagem; sem `--confirm` só simula                                                                                                                                                                                                                                                                                                                                   | escrita                         |
| `ops/producao-parada-cheguei-rafa.sh`                                   | viagens ativas do motorista Rafa (paradas e sequências) e últimos pedidos do grupo do WhatsApp (09/11/2026, bug da lista de paradas do "cheguei")                                                                                                                                                                                                                                                                                               | leitura                         |
| `scripts/ops/producao-lembrete-viagens-despachadas.sh`                  | viagens `dispatched`/`in_transit` sem "Iniciar rota" que passam a receber o lembrete "sem evento" (spec 299, emenda D10 de 10/11/2026), interruptor da empresa e `DRIVER_REMINDERS_ENABLED` (só true/false); rodar antes de promover a emenda à `main`                                                                                                                                                                                          | leitura                         |
| `scripts/ops/producao-pos-promocao-678.sh`                              | conferência pós-deploy da promoção #678 de 11/11/2026: tabelas novas, rotina `whatsapp-inbox.chat.expire` pausada, trava e coleta de canhoto desligadas, lembrete do motorista (§ 5.29)                                                                                                                                                                                                                                                         | leitura                         |

Quando uma consulta nova for útil mais de uma vez, copie-a para `scripts/ops/` neste repositório.

- **Aviso de certificado digital** (conferido em 30/10/2026): a rotina `notification.schedules.run` do
  worker avisa por caixa de entrada e e-mail quem enviou o certificado ativo quando faltam 30, 15, 7, 3
  e 1 dia e quando ele vence (modelos `fiscal.certificate-expiring` e `fiscal.certificate-expired`,
  semeados pela API). Para ver se saiu: contador `expiringCertificates` e a mensagem
  `certificate_expiry_swept` nos logs do `worker` (`get-logs` com `filter: certificate_expiry`). Antes
  disso o único sinal era o motivo `certificate_expired` no cartão da importação automática.

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

### Leitura automática do canhoto pelo bot do WhatsApp (`CANHOTO_OCR_ENABLED`)

Só o serviço `api` decide o bot (o `worker` também declara a variável, para o leitor). Sem a variável, o padrão é
ligado fora de produção e desligado em produção; `true`/`false` explícitos mandam.

```bash
railway variables -s api -e production --kv | grep '^CANHOTO_OCR_ENABLED='   # conferir (não é segredo)
railway variables -s api -e production --set CANHOTO_OCR_ENABLED=false       # desligar
railway variables -s api -e production --set CANHOTO_OCR_ENABLED=true        # religar
```

Efeito (API reinicia): com `false`, a foto que ninguém pediu não é lida ("Este canhoto é da NF…?" some); a foto
pedida pela entrega aberta continua entrando. Conferir depois com `railway deployment list -s api -e production`
(deploy novo `SUCCESS`) e `curl -s -o /dev/null -w '%{http_code}' https://api.fernandes-transportadora.com.br/health/ready`
(200).

- **06/11/2026 23:14 UTC:** desligado em produção (`true` → `false`) a pedido do Anderson, até a promoção do
  `f0694a9d0` ("no grupo, o bot só lê o canhoto quando é marcado na foto"). **Ao promover staging → main, religar
  com `true`**: com o código novo, a leitura só acontece quando o motorista marca o bot na foto.

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

### Só o `mark-deployed` fica vermelho (05/11/2026)

Sintoma: todos os `deploy-*` verdes e só o `mark-deployed` falha no passo "Avançar o marco", com
`remote: fatal error in commit_refs` / `[remote rejected] HEAD -> refs/deploy/production/api`. É erro do lado
do GitHub ao gravar a ref do marco; **o código já está no ar** (conferir `deployment list` do Railway em
`SUCCESS`). Foi o caso do run da promoção #543 (`2c33b1d`), e o do hotfix #537 também terminou vermelho.
O run pode não aceitar `gh run rerun --failed` ("cannot be retried"). Efeito: o marco fica no commit antigo e o
próximo push de `main` volta a considerar os mesmos alvos como alterados (publica de novo, sem dano). Se
quiser avançar o marco à mão: `git push --force origin <sha-da-main>:refs/deploy/production/<alvo>` para cada
alvo (`api frontend landing client driver worker cron`).

Variante vista em 06/11/2026 (staging, run 42281633564): `[remote rejected] HEAD -> refs/deploy/staging/driver (missing necessary
objects)`. Mesmo tratamento: conferir os `deploy-*` verdes; o próximo push corrige o marco.

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

**Resultado (28/10/2026, terceira promoção do dia):** PR #424 (merge a1d37cb): QR do Evolution, visual, data de
prorrogação, automações da Spani e o reconcile que espera o Keycloak (#420; o 502 do #408 não se repetiu). Duas
migrations aditivas aplicadas (`contractor_automations`, `occurrence_new_due_date`; 336 migrations checadas). Os gates
passaram, mas a Railway **pausou os deploys**: os builds da API e do cliente ficaram em `BUILDING` por ~20 min e
`deploy-api`/`deploy-client` caíram por tempo esgotado ("api não estabilizou dentro do tempo limite"); um re-run
imediato respondeu `Deploys have been paused temporarily` ao `railway up` e falhou de novo sem criar deployment. Os
deployments travados terminaram sozinhos (API em `DEPLOYING` às 18:22 e `SUCCESS` às 18:43), então o re-run seguinte
(`rerun-failed-jobs` no mesmo run, depois de a Railway liberar) completou worker, cron, painel, app do motorista,
`mark-deployed` e as conferências. Regra: com `Deploys have been paused`, **não insistir**; olhar
`mcp__Railway__list-deployments` (o deployment criado pode concluir sozinho) e só refazer os jobs falhos depois que
nenhum deployment do serviço estiver em `BUILDING`/`DEPLOYING`/`QUEUED`. Enquanto isso a produção seguiu na versão
antiga, sem queda.

Passo manual pós-deploy (não é automático): publicar o modelo de e-mail `ocorrencia.prorrogacao-boleto` com
`producao-publicar-modelo-prorrogacao.sh` (pasta `ativada`, fora do repositório): clona a `main` em diretório
temporário, mostra o plano e só grava se digitar `producao`; precisa de `DATABASE_PUBLIC_URL` do `postgres-app` (sem
TCP proxy ele para sem alterar nada). Depois, ligar "Pedir a nova data de vencimento" no tipo de prorrogação (aba
Tipos de `/ocorrencias`). _Resultado desse passo: a registrar quando o Anderson rodar._

### Keycloak de produção: checar a saúde (somente leitura)

Script `producao-keycloak-saude.sh` (na pasta `ativada` do Anderson, fora do repositório): mostra os deploys e as
últimas 80 linhas de log do `keycloak`, e testa o discovery do realm, os certificados e o endpoint de token **sem
credencial** (200 e 400/401 = de pé; 502/503 = fora do ar). Não troca variável nem redeploya.

Caso de 28/10/2026 (promoção #408): `deploy-api` falhou duas vezes em "Reconciliar realm" com `curl 502` logo depois
de "Deploy identity" dar sucesso. O passo de deploy só espera o Railway marcar `SUCCESS`; o `keycloak-reconcile.sh`
não espera o Keycloak responder. Nesse caso a API, o worker e os frontends **não** sobem (os jobs seguintes ficam
pulados) e as migrations não rodam. Não insistir em re-run: ler o log do `keycloak` primeiro.

## 5.5 Conferir que o boleto não vai ao WhatsApp do cliente (29/10/2026)

Pedido do Anderson: em produção o boleto ainda **não** pode sair para o WhatsApp do cliente.

Conferido na `main` (a1d37cb) e no Railway, sem escrever nada:

- **Código:** o único caminho que manda boleto por WhatsApp ao cliente é `forward-contractor-reply-by-whatsapp.use-case.ts`
  (`lockSendable`), acionado por clique do operador/motorista (painel e app), nunca pelo worker ou cron. Exige
  `company_occurrence_types.client_channel` em `whatsapp` ou `both` **e** `whatsapp_evolution_settings.status = 'active'`;
  senão lança `ContractorReplyWhatsAppOffError` / `WhatsAppEvolutionNotConfiguredError` / `WhatsAppEvolutionDisabledError`.
  A resposta de texto ao cliente (`send-client-reply.use-case.ts`) tem a mesma trava. Padrões: `client_channel = 'email'`,
  `status = 'disabled'`, `default_provider = 'meta'`.
- **Railway:** o ambiente `production` não tem o serviço `evolution-api` (nem redis/postgres do Evolution); só existem
  em staging. `EVOLUTION_BASE_URL` / `EVOLUTION_GLOBAL_API_KEY` não devem existir no `api` de produção.
- **Falta confirmar no banco/variáveis** (o MCP do Railway bloqueou a leitura de variáveis e não há `railway` logado na
  sessão): `bash /home/miyazaki/Documents/personal/ativada/producao-confere-boleto-whatsapp.sh` (somente leitura; lista
  tipos com canal whatsapp/both, `whatsapp_evolution_settings` por empresa, entregas por WhatsApp já registradas e os
  nomes das variáveis EVOLUTION*/WHATSAPP*). Esperado: nenhum tipo `whatsapp`/`both`, nenhuma linha `active`, nenhuma
  entrega `sent` por WhatsApp.
- **Resultado do script (29/10/2026, Anderson):** nenhuma variável EVOLUTION*/WHATSAPP* no `api`; 16 tipos, todos
  `client_channel = 'email'`; 0 linhas em `whatsapp_evolution_settings` e em `whatsapp_channels`; 0 entregas por
  WhatsApp. Confirmado: nada em produção envia boleto ao WhatsApp do cliente.
- **Para ligar no futuro:** só com aval do Anderson (seção 5.3/5.4).

## 5.6 Ligar o envio automático do boleto ao cliente em produção (01/11/2026)

Levantamento só de leitura (código da `main` b76cb5a e Actions); nada foi alterado em produção.

**Bloqueio: a spec 286 (matriz "Retorno ao cliente", WhatsApp automático, queda para e-mail) e a 288 ainda não estão em
produção.** O push da promoção #445 na `main` (run 41249494222, 31/10 22:44Z) reprovou no gate (`quality-app
(worker-transportada)`: teste `contractor reply parity`, `occurrence-contractor-reply.constant.ts` não é idêntico na api
e no worker, a spec 288 acrescentou `CONTRACTOR_REPLY_CLIENT_EMAIL_TARGET` só na api) e todos os `deploy-*` foram
pulados. Produção segue na `fa6d43f` (hotfix #451, 29/10), sem as migrations `20261029000937_occurrence_type_client_channels`,
`20261029005751_client_whatsapp_automatic`, `20261029023933_client_email_fallback_from` e
`20261029190000_occurrence_drop_forward_email`. Antes de testar: sincronizar o arquivo no worker (em `staging`, depois
promoção) e conferir o `Deploy` verde e `/health/ready` com `migrations: up`.

**Disparo:** o boleto só sai sozinho quando a contratante responde com o PDF e o worker o aceita: tipo com a resposta da
contratante em encaminhar automaticamente, PDF conferido como boleto, sem anexo duplicado. Resposta vazia ou "document_not_confirmed"
fica para o operador.

**Checklist para testar (por canal):**

- Tipo de ocorrência (ex. Prorrogação do boleto) → Retorno ao cliente: canal ligado, **modo Automático** e **modelo
  escolhido** (sem modelo o canal não sai: `skipped / template_missing`).
- E-mail: contato do cliente com finalidade `boleto` em `delivery_client_contacts`, casado pelo CNPJ do destinatário da nota.
  Usa o mesmo caminho do e-mail de ocorrência (Resend da empresa, domínio verificado, ver 5.1): nada novo na infra.
  **`EMAIL_ALLOWED_RECIPIENTS` é proibida em produção**: não há trava, o e-mail vai ao cliente de verdade. Para testar
  com segurança, usar um cliente/nota de teste com o e-mail do Anderson.
- WhatsApp: precisa de um **Evolution em produção**, que hoje **não existe** (só staging). Falta: serviço `evolution-api`
  (+ redis/postgres) no `production`, `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY` (referência) no `api` e no
  `worker`, "Criar e conectar" e QR no painel (`whatsapp_evolution_settings.status = 'active'`, `daily_cap` > 0),
  contato `whatsapp` finalidade `boleto` em E.164 (`+55...`). Sem instância ativa ou sem número, cai para o e-mail
  (se ligado) e registra o motivo. Aprovação do Anderson antes de criar qualquer serviço ou variável.
- Perfil fiscal da transportadora com e-mail e telefone (variáveis `emailTransportadora`, `telefoneTransportadora`
  dos modelos).
- O boleto de teste tem que ser real e conferido (o leitor de documento recusa PDF sem texto de boleto).
- Depois: linha do tempo da ocorrência e `occurrence_contractor_reply_deliveries` (`trigger = automatic`); log do worker
  `occurrence_contractor_reply_whatsapp_automatic`.

**Resultado (01/11/2026):** o gate reprovado era só a paridade do worker (corrigida no #475). A promoção foi feita por um
commit fixo da staging (`b9d7b1b`, PR #481) em vez da branch `staging`, porque a spec 287 continuava recebendo merges
(promover a branch levaria trabalho incompleto). Merge `5f01233`: Deploy da `main` verde (api com "Conferir migrations
aplicadas" e "Conferir as origens do frontend", worker, cron, painel, motorista, client, landing). A 286/288 estão em
produção com WhatsApp desligado. Teste instável visto no CI da staging: `trip-proof-pdf-end-to-end` compara com `999` e
bate no id aleatório da viagem; um re-run passou. Regra: promover por commit fixo quando a staging estiver em movimento.

## 5.7 Teste real do boleto automático em produção (01/11/2026): deu certo

Estado: a 5.6 estava bloqueada; depois da promoção das specs 286/288/289 e do Evolution de produção
(`evolution-api|redis|postgres-production`), o Anderson testou pelo app do motorista (Prorrogação do boleto, NF
907034/2, viagem `2b2ea116`) e confirmou que deu certo. Evidência nos logs (companyId da transportadora, tudo `UTC`):

- 21:01 `POST .../client-contacts` 201 (duas vezes): o motorista digitou e-mail/WhatsApp do cliente.
- 21:02:21 `POST .../documents/:id/occurrences` 201; 21:02:22 worker `contractor_mail_sent` (e-mail à contratante).
- 21:04:51 resposta da contratante com PDF: `inbound_email_dkim_verified` com `contractorReply.kind=applied`,
  `delivered=true`, `documentChecked=true`, `documentTextRead=true`, `toStatus=reply_received`.
- 21:04:51 worker `occurrence_contractor_reply_whatsapp_automatic` com `sent=1`, `failed=0` (WhatsApp ao cliente pelo
  Evolution); depois, webhooks `POST /public/whatsapp-evolution/<webhookId>` 200.
- O e-mail ao cliente não tem linha própria nesses logs: conferir `occurrence_contractor_reply_deliveries` (canal `email`).

**Armadilhas do teste (para o próximo):**

- No app do motorista o formulário só pede e-mail/WhatsApp do cliente se o tipo tiver **"Pedir o contato do cliente ao
  motorista"** marcado **e** o canal com o cliente diferente de desligado (`asksClientContact` e `clientChannel`).
  Sem isso os campos não aparecem (foi o que aconteceu na primeira tentativa).
- "Toque em Cheguei para liberar a entrega" é a trava normal até a chegada ser registrada (`/stops/:id/arrive`).
- Na janela anônima e no relogin o app volta ao mesmo ponto; o servidor não guarda estado do formulário.
- O teste enviou a mensagem a contatos reais: usar cliente/nota de teste com os contatos do Anderson.

**Ícone do tipo (01/11/2026):** o tipo "Prorrogação do boleto" estava sem ícone (`icon_name` nulo), então o app do motorista
não mostrava nada. Catálogo fechado do CHECK: `alert camera clipboard-list clock document invoice message money package
truck`. Escolhido `invoice` (é o boleto). Aplicação por `scripts/ops/producao-icone-tipo-ocorrencia.sh` (sem `--confirm`
só lista; com `--confirm` grava só `icon_name` e `updated_at`; `ENV_NAME=production` com aprovação). Também dá para
trocar no painel (Tipos de ocorrência → "Ícone do tipo"). Aplicado em produção em 02/11/2026: a 2ª execução já mostrou `icon_name = invoice` no "antes" (a 1ª gravou, mas o `railway ssh`
calou com a saída em pipe `| tee`; por isso o script de `ativada/` usa `script` para dar terminal ao `railway`).

## 5.8 Serviços em crash no Railway (02/11/2026)

Conferido pelo MCP do Railway (`get-status`, `list-deployments`, `get-logs`); nenhuma variável foi lida e nada foi
redeployado. Nada disto veio da promoção #491: os deploys de `osrm-production` e `map-tiles-production` dela ficaram
`SKIPPED` (os dois não rebuildam desde 28/09) e o `backup` do #491 terminou `SUCCESS`.

| Ambiente | Serviço                                   | Estado                                                  | Causa                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| produção | `backup`                                  | `CRASHED` às 06:00 de 02/11 (some com o deploy do #491) | `curl: (55) Send failure: Connection reset by peer` no `dump_app` (upload do dump ao bucket, `backup.sh` linha ~125). O backup de 02/11 **não foi gravado**; o próximo é 06:00 de 03/11.                                                              |
| produção | `osrm-production`, `map-tiles-production` | `FAILED` (build) desde 28/09                            | O build baixa o `.pbf` direto do Geofabrik (`sudeste-260914.osm.pbf`) e recebe **404**: o Geofabrik apaga os datados em poucos dias. A variável deveria apontar para o espelho no bucket (ver `osrm-extract.md`, "A variável aponta para o espelho"). |
| staging  | `staging-refresh`                         | `CRASHED` no domingo 01/11 05:00                        | `staging_refresh_redeploy_not_configured`: faltam `RAILWAY_PROJECT_TOKEN`/`RAILWAY_API_TOKEN` ou `STAGING_API_SERVICE_ID` no serviço; a guarda de boot sai com 1 antes de tocar no banco.                                                             |
| staging  | `osrm`, `map-tiles`                       | `FAILED` (build)                                        | Mesmo problema do `.pbf` (ver 5.4).                                                                                                                                                                                                                   |

Ler o valor das variáveis exige script do Anderson (o classificador bloqueia a leitura de variáveis de produção pelo
MCP).

### Backup de produção parado de 22/10 a 02/11 (resolvido em 02/11/2026)

- **Efeito:** o último backup bom antes disso foi o de 21/10 (`EXITED`); de 22/10 a 02/11 o cron `backup` terminou em
  `CRASHED` todo dia (`curl: (55)` no upload) e **nenhum dump foi gravado nesses 12 dias**.
- **Causa:** `BACKUP_S3_SECRET_ACCESS_KEY` (e a chave de acesso) no serviço `backup` não batiam com as credenciais atuais
  do bucket de ops (`transportada-ops`). O bucket aceita os dois estilos de URL (path e virtual-host), então o estilo não era
  o problema. As chaves do bucket mudaram e a cópia nas variáveis ficou velha.
- **Correção:** `producao-backup-sincroniza-chaves.sh --aplicar` leu as credenciais com `railway bucket credentials --json`
  (exige o projeto `transportada-ops` linkado no diretório de trabalho; não aceita `-p`) e gravou `BACKUP_S3_*` em `backup` e
  `restore-test` com `railway variables --skip-deploys`. **`--skip-deploys` só vale no próximo deploy**: depois é preciso
  redeployar ou rodar o cron de novo (`railway cron run --yes`).
- **Prova:** três execuções fora do horário (10:59, 11:10 e 11:26 UTC) terminaram `EXITED`. `producao-backup-confere-dump.sh`
  baixou o dump de `app` (17,3 MB), com `sha256` igual ao publicado e ao do `manifest.jsonl`, cabeçalho `Salted__` (cifrado);
  o manifest registra 266 tabelas e a migration `20261101160000_whatsapp_send_pacing`.
- **Ainda não provado:** restauração do dump. O cron `restore-test` (`0 7 5 * *`) usa as mesmas chaves e é quem prova.
- **Scripts** (em `tmp/ops/`, ignorado pelo git; saídas em `tmp/ops/saidas/`): `producao-backup-diagnostico.sh` (logs, nomes
  e tamanhos das variáveis, listagem do bucket), `producao-backup-sincroniza-chaves.sh` (dry-run por padrão),
  `producao-backup-roda-agora.sh` (`--rodar`; `--redeploy-e-rodar`) e `producao-backup-confere-dump.sh` (tamanho real,
  hash e manifest). Cron: `railway cron list --limit 30` e `railway cron run --yes`.
- **Armadilha de diagnóstico:** a primeira listagem do diagnóstico mostrou dumps de 105 B por erro do parser (regex que
  cruzava objetos); o tamanho real vem do `HEAD`/`Content-Length` ou do `manifest.jsonl`.
- **Pendente:** alerta quando o `backup` cair (hoje só se descobre olhando o Railway).

## 5.9 Staging-refresh com recorte (spec 291)

Não mexe em produção: lê o backup cifrado de sempre e só escreve em staging. Fica aqui porque é o
caminho de diagnóstico quando o refresh de domingo cai.

- O job restaura o dump **inteiro** num banco temporário `staging_refresh_source` (no Postgres de
  staging), roda `deploy/staging-refresh/prune-source.sql` nele e restaura em staging só o recorte.
  O banco temporário é derrubado no fim e no `cleanup`.
- Janela: `STAGING_REFRESH_WINDOW_DAYS` (padrão 60) no serviço `staging-refresh`.
- Eventos de log em ordem: `staging_refresh_source_restored`, `staging_refresh_source_pruned`
  (com `notes` e `trips` que sobraram), `staging_refresh_restored`. O aviso
  `staging_refresh_unclassified_tables_emptied` lista tabela sem política (foi esvaziada).
- Falhas conhecidas: `staging_refresh_failed` com `step: restore` e `permission denied to create
database` = o usuário do Postgres de staging não tem `CREATEDB`; `staging_refresh_scrub_*_missing` =
  coluna de contato renomeada (ajustar o `prune-source.sql`); `add constraint` falhando = recorte
  deixou linha órfã (abrir a spec 291). Em todos, staging ainda está como estava antes do ciclo.

## 5.10 NF devolvida pelo escritório continua presa na viagem (03/11/2026)

Devolução feita pelo escritório (`field-return`) marcava a nota `returned` sem soltá-la (`released_at`
vazio), então ela seguia "viva" na viagem antiga e não entrava em outra (índice
`trip_documents_live_nfe_document_unique`). Caso: NFs 920141, 920142, 920144 e 920145, devolvidas "ausente"
em 30/10 e viagem `completed`. Diagnóstico: `producao-devolucao-notas.sh`; correção de dados:
`producao-soltar-notas-devolvidas.sh --confirm`. A devolução do escritório agora solta a nota por padrão.
Executado em 03/11/2026 (8:37): 4 linhas atualizadas (`released_at`), as outras 5 NFs da lista nunca estiveram em viagem.
Em 04/11/2026 mais duas, da mesma viagem e devolvidas em 30/10: 920247 e 920143, soltas com
`producao-nota-devolvida.sh <NF...> [--confirm]` (lê e, com `--confirm`, solta por número).
`producao-soltar-todas-devolvidas.sh [--confirm]` lista toda nota `returned` presa em viagem
`completed`/`cancelled`; 906991 e 918100 (`establishment_closed`, 09/10 e 29/10) também foram soltas a pedido do
Anderson; depois disso não restou nota devolvida presa em viagem encerrada. O WhatsApp e o app do motorista (sem "voltou ao barracão") ainda não soltam.
Dica: o `railway ssh` precisa rodar de uma pasta ligada ao projeto (`cd` no repositório antes).

## 5.11 Conferir a hora gravada das ocorrências (04/11/2026)

Somente leitura. Dúvida "a data/hora da ocorrência está errada": roda
`bash /home/miyazaki/Documents/personal/transportada/tmp/ops/producao-data-ocorrencias.sh`, que grava em
`tmp/ops/saidas/` a hora do banco, o fuso do banco e do container da api, `created_at` das últimas
ocorrências de prorrogação em UTC e em Brasília e a lista de colunas `timestamp without time zone`.
Medido em 04/11/2026: banco e container em UTC, nenhuma coluna sem fuso, `created_at` é `timestamptz`;
a tela converte no navegador. As ocorrências de 03/11 13:32 e 13:31 foram de fato criadas na véspera.

## 5.12 Ocorrência solucionada aparece "Em andamento" na linha do tempo (04/11/2026)

Consulta: `ops/producao-ocorrencia-reaberta-04-11.sh` (somente leitura; ocorrência por janela de horário, com
eventos de solução, da tratativa e do retorno da contratante). Causa: a operadora solucionou a ocorrência às 09:20 e,
às 09:21, marcou o retorno da contratante (parado em `needs_operator` desde 29/10) como tratado; a linha do tempo
traduzia `handled` em "Em andamento" mesmo depois de solucionada. Dado correto: a ocorrência segue solucionada
(nenhum evento de reabertura), então não há dado a corrigir; era só a etapa derivada na leitura.

## 5.13 Primeira publicação do fluxo da conversa individual do WhatsApp (05/11/2026)

Depois da promoção #530, a simulação de `producao-publicar-falas-do-bot.sh` mostrou **"estado atual não publicado"**:
produção nunca tinha tido o grafo `transportada_root` publicado, então a conversa individual com o bot (menu do
motorista com saí/cheguei/entregar/ocorrência, menu do operador, emissão) não estava ativa — o grupo não depende dele.
Com aprovação do Anderson, publicado em 05/11/2026:

```bash
ENV_NAME=production bash /home/miyazaki/Documents/personal/ativada/producao-publicar-falas-do-bot.sh            # diff
ENV_NAME=production bash /home/miyazaki/Documents/personal/ativada/producao-publicar-falas-do-bot.sh --confirm  # publica
```

Resultado: empresa `ce523659-5e30-4b13-96ce-8d603d8cb9e9`, 118 nós, **versão 1**; a simulação seguinte deu
"nenhuma mudança". ⚠️ Toda mudança em `whatsapp-flow-graph.constant.ts` que chega à `main` pede repetir os dois passos
(sem isso o privado segue na versão anterior, sem erro).

## 5.14 Spike da foto da CNH (spec 295 T4.1, 05/11/2026) — somente leitura

Lido: contagens de `fleet_drivers`, `user_company_memberships`, `identity_user_pictures`, `aggregate_documents`,
`aggregate_application_attachments` e `stored_objects`, e **um** PDF de CNH (o único de motorista sem foto) baixado do
bucket. Como: `railway ssh -p <projeto> -s api -e production` com script em base64 (padrão da §2), `sql.begin('read only', …)`;
o download usou `Bun.S3Client` com as `OBJECT_STORAGE_*` do próprio container, bytes em base64 no stdout direto para
arquivo na pasta temporária da sessão (nada impresso na tela), apagada ao fim. Nenhuma escrita em banco, bucket,
variáveis ou Keycloak. Resultado em `specs/295-o-motorista-poe-a-propria-foto/spike-cnh.md`.

## 5.15 Credencial da foto da CNH (spec 295)

O worker grava a foto da CNH na API com credencial própria: client `transportada-worker-cnh-picture`
(só `client_credentials`, papel de realm `transportada-service`, mapper de audiência `transportada-api`)
e, no banco, uma pessoa sintética com o papel `cnh-picture-service` em cada empresa ativa. O
`--import-realm` do Keycloak **ignora realm existente**: o `realm.json` não cria nada em staging nem em
produção, então o client nasce pela API de administração. Nunca `railway config apply`.

Feito em staging em 05/11/2026 (client `d99df407-9b16-484f-b85a-5abbf4c4bb42`, conta de serviço
`19f27ebf-44f0-4ffd-9236-c205b796d3f6`, usuário sintético `e188c430-9c9c-45ae-9a5d-92e396a02f66`).
Para repetir (produção: `ENV_NAME=production`; cada script pede ainda digitar `producao`):

```bash
cd /home/miyazaki/Documents/personal/ativada
ENV_NAME=staging bash producao-criar-cnh-picture-client.sh            # simulação
ENV_NAME=staging bash producao-criar-cnh-picture-client.sh --confirm  # client + mapper + papel + variáveis
ENV_NAME=staging bash producao-criar-cnh-picture-service.sh           # simulação: contagens
ENV_NAME=staging bash producao-criar-cnh-picture-service.sh --confirm # usuário, vínculo e memberships
railway redeploy -s worker -e staging -y
railway logs -s worker -e staging --since 10m | grep -E 'cnh_picture_disabled|worker_started'
```

- O primeiro grava, com `--skip-deploys` e sem imprimir o segredo (`railway variable set --stdin`):
  `CNH_PICTURE_CLIENT_ID` e `CNH_PICTURE_CLIENT_SECRET` no `worker` e `KEYCLOAK_CNH_PICTURE_CLIENT_SECRET`
  no `keycloak` (só para o `realm.json` bater num reimport). Mostra o sha256 truncado para comparar.
- Ligado: o boot do worker **não** mostra `cnh_picture_disabled`. Backfill só em simulação sem aval:
  `railway ssh -s worker -e staging -- bun dist/cnh-face/cnh-picture-backfill.main.js --dry-run`.
- Até a branch `work/service-token` (ADR-0047, emenda 2026-11-05) a API recusava todo token de conta de
  serviço em 401 (o verificador exigia `company_id`). Depois dela, o token do serviço passa **se** tiver
  `aud=transportada-api`, o papel `transportada-service`, `azp` em `SERVICE_CLIENT_IDS` e nenhuma
  `company_id`; e só alcança as permissões de serviço.

### Passos manuais por ambiente para as chamadas worker→API (staging primeiro, produção com aval)

O `realm.json` não chega a realm existente: tudo no Keycloak é pela tela ou pela API de administração.

1. **Keycloak, os dois clients** (`transportada-worker` e `transportada-worker-cnh-picture`): Clients →
   client → Client scopes → `<client>-dedicated` → Add mapper → By configuration → **Audience**. Nome
   `transportada-api-audience`, _Included Client Audience_ `transportada-api`, _Add to access token_
   **ligado**, _Add to ID token_ **desligado**. Staging: o do CNH já existe (05/11/2026), falta o do
   `transportada-worker`. Produção: os dois.
2. Conferir que `service-account-<client>` tem o papel de realm `transportada-service`, e o usuário
   sintético a membership com o papel de serviço só nas empresas em que deve agir.
3. Conferir um token sem imprimir o segredo: decodificar o payload e ver `aud` com `transportada-api`,
   `azp` com o client, `typ=Bearer` e nenhuma `company_id`.
4. **Variáveis**:

   | Serviço  | Variável                  | Valor                                                                        |
   | -------- | ------------------------- | ---------------------------------------------------------------------------- |
   | `api`    | `SERVICE_CLIENT_IDS`      | opcional; ausente vale `transportada-worker,transportada-worker-cnh-picture` |
   | `api`    | `MDFE_AUTO_ISSUE_ENABLED` | **`false`** (ou ausente) — ligar só com aval do dono                         |
   | `worker` | `MDFE_AUTO_ISSUE_ENABLED` | **`false`** (ou ausente) — ligar só com aval do dono, junto com a API        |

   Client de serviço novo entra em `SERVICE_CLIENT_IDS` **e** no realm; fora da lista, o token é 401.

5. Depois do deploy, nos logs da API: chamadas do worker deixam de responder 401 (`UNAUTHENTICATED`); um
   403 `FORBIDDEN` é membership faltando na empresa ou permissão que o serviço não tem; 404
   `MDFE_AUTO_ISSUE_DISABLED` é o interruptor desligado (esperado).

**05/11/2026, staging: audiência do `transportada-worker`.** Mapper `transportada-api-audience` criado no client
`transportada-worker` (API de administração). Tokens dos dois clients: `typ=Bearer`, `aud=transportada-api`, sem
`company_id`, papel `transportada-service`. `PUT /fleet/driver-attachments/<uuid aleatório>/cnh-picture` com
`x-company-id`: client da CNH 404 `FLEET_DRIVER_ATTACHMENT_NOT_FOUND` (autenticou e autorizou); `transportada-worker`
**401**, porque a conta de serviço dele não tem linha em `external_identities` (0) — falta o usuário sintético
`automation`. `MDFE_AUTO_ISSUE_ENABLED` ausente em `api` e `worker`. Backfill da CNH em simulação: tudo zero.

## 5.16 Usuário `automation` (ADR-0047) em staging e estado de produção (05/11/2026)

`/home/miyazaki/Documents/personal/ativada/producao-criar-automation.sh` agora aceita `ENV_NAME=staging|production` (padrão `staging`).
Padrão é simulação; `--confirm` grava (produção ainda pede digitar `producao`). Roda dentro do container da `api` (bun), como o script da CNH.

- **Staging:** usuário sintético criado e ligado a `service-account-transportada-worker`, com membership ativa e papel `automation` na empresa ativa (1 de 1).
  Verificação: o `worker` obteve token `client_credentials` e a rota `PATCH /trips/:id/documents/:documentId/proof/review/automatic` (UUIDs aleatórios, corpo inválido) respondeu 400 de validação, não 401/403.
- **Produção (só leitura, corrigido em 05/11 à tarde):** o usuário `automation` **existia** desde 28/10 (`18152f2a-…`, membership ativa
  com o papel na única empresa), mas ligado ao subject errado, sem vínculo com a conta de serviço `service-account-transportada-worker`.
  Por isso o script, que procura pelo subject da conta de serviço, o dava como ausente. Resolvido na seção 5.17.

## 5.17 Credenciais de serviço em produção (05/11/2026)

Com aval do dono ("Sim, promover e configurar"), depois do deploy da `main` (run 42047810579, commit 2db0003b8, PR #536, sucesso).
MDF-e automático **continua desligado**: `MDFE_AUTO_ISSUE_ENABLED` ausente em `api` e `worker`; `SERVICE_CLIENT_IDS` ausente (vale o padrão).

1. **Keycloak.** O papel de realm `transportada-service` **não existia em produção** (404): criado igual ao `realm.json` e ao
   staging (só o nome, não composto, sem atributos) e dado a `service-account-transportada-worker` (`0c5fe9dc-…`). O mapper
   `transportada-api-audience` do `transportada-worker` já existia. Depois, `producao-criar-cnh-picture-client.sh --confirm`:
   client `transportada-worker-cnh-picture` `ac8b0cf1-6675-4f41-a8ff-73646f7f34bd`, conta de serviço `10625642-62d1-4e40-b1a3-fc1e5a8f1044`
   só com `transportada-service`, mapper criado, variáveis `CNH_PICTURE_CLIENT_ID/SECRET` (worker) e `KEYCLOAK_CNH_PICTURE_CLIENT_SECRET`
   (keycloak) gravadas com `--skip-deploys`.
2. **Banco.** Em vez de rodar `producao-criar-automation.sh` (criaria um segundo usuário `automation`), um único INSERT em
   `external_identities` ligou o subject `0c5fe9dc-…` (issuer = `KEYCLOAK_ISSUER`) ao usuário existente `18152f2a-…`; nenhum usuário
   nem membership novos. O script em simulação passou a mostrar `userExisted: true`, `alreadyWithRole: 1`, `toCreate: []`.
   `producao-criar-cnh-picture-service.sh --confirm`: usuário sintético `73788b9b-b303-4974-a242-ce2267742086`, 1 membership
   `cnh-picture-service` (1 de 1 empresa ativa).
3. **Worker.** `railway redeploy -s worker -e production -y` → `SUCCESS`. Boot: `worker_started`, `mdfe_auto_issue_disabled`, sem
   `cnh_picture_disabled` (foto da CNH ligada).
4. **Verificação** de dentro do worker, `x-company-id` = `ce523659-…`, sem imprimir token:
   - `transportada-worker`: `typ=Bearer`, `aud=[transportada-api, account]`, `azp=transportada-worker`, sem `company_id`, papel
     `transportada-service`. `PATCH /trips/:id/documents/:documentId/proof/review/automatic` (UUIDs aleatórios, corpo `{}`) → 400
     `INVALID_REQUEST`; `POST /trips/:id/mdfe-manifests/automatic` → 404 `MDFE_AUTO_ISSUE_DISABLED` (nada emitido).
   - `transportada-worker-cnh-picture`: `typ=Bearer`, `aud=transportada-api`, sem `company_id`, só `transportada-service`.
     `PUT /fleet/driver-attachments/<uuid aleatório>/cnh-picture` com multipart `file` (WebP 1×1) → 404 `FLEET_DRIVER_ATTACHMENT_NOT_FOUND`.
     Sem corpo a rota dá 400: o roteador autoriza antes do `parse`, então 400 também já prova que passou de 401/403.
5. **Backfill da CNH em simulação** (`bun dist/cnh-face/cnh-picture-backfill.main.js --dry-run` no worker): `candidates 0`, `applied 0`,
   `failed 0`, `keptExisting 0`, `objectMissing 0`, `skipped 0`. `--confirm` não foi rodado.

**Limpeza pendente:** o usuário `automation` (`18152f2a-…`) mantém o vínculo antigo com o subject `706677ad-2659-435d-8e73-2c0c7248dcd4`,
um usuário comum do Keycloak (username = id do usuário do app, sem `serviceAccountClientId`) criado em 28/10. Não concede nada: as
quatro permissões do papel `automation` estão todas em `SERVICE_ONLY_PERMISSIONS` e token de gente não as usa (`isUsableBy`, emenda
ADR-0047), e a membership não tem grupo nem permissão avulsa (só a linha do papel). Remover o vínculo e esse usuário do Keycloak
numa próxima janela, com aval.

## 5.18 Amostra de fotos de comprovante para spike (05/11/2026, somente leitura)

Spike T4.8a da spec 294 (`specs/294-o-motorista-segue-a-ordem-da-parada/spike-canhoto.md`). Leitura só por
`select` em `trip_delivery_proofs` × `stored_objects` e `GET` no bucket com o cliente S3 de dentro do container da
`api` (padrão da §2, script em base64, saída por prefixo `__IMG__`, redirecionada para arquivo local — nunca para a
tela). Nenhuma escrita. 28 fotos de produção baixadas para a pasta de rascunho da sessão, processadas **só localmente**
(nenhum serviço externo) e apagadas ao fim. Contagem em 05/11: produção 383 fotos `photo` (213 `approved`, 169
`pending`, 1 `rejected`), nenhuma `cargo`, nenhuma com `canhoto_read_source`; staging 23 `photo` + 9 anexos de
ocorrência.

Segunda amostra (spike T4.8b, `spike-canhoto-gratuito.md`, 05/11/2026), mesma forma de leitura (`select` em
transação `read only` e `GET` no bucket de dentro da `api`, script em `spike-canhoto-gratuito/fetch-sample.mjs`): 111
fotos `photo` (110 `approved` + 1 `rejected`, ordem por `md5(id)`), em 4 lotes de 28 pelo `railway ssh` (lote maior
deixa a saída base64 em ~18 MB por chamada). Junto, o número da nota anexada e os números das notas da mesma viagem e
da mesma parada, gravados só no rascunho local para comparar por igualdade, nunca impressos. Staging: 29 imagens
(fotos de comprovante + anexos de ocorrência). Nenhuma escrita; nada enviado a serviço externo; pasta apagada ao fim.
⚠️ O Docker Desktop não monta `/tmp` (pasta de rascunho): para testar em Alpine use `docker create` + `docker cp`.

## 5.19 Pós-deploy da spec 294 em staging (2026-11-05)

Deploy 42111238279 (commit 8375877f2, PR #541) em `success`; api, worker, cron, frontend e driver `SUCCESS`
(`osrm` e `map-tiles` seguem `FAILED` em staging, alheios à 294).

- **Grafo do WhatsApp (conversa individual):** `ENV_NAME=staging bash /home/miyazaki/Documents/personal/ativada/producao-publicar-falas-do-bot.sh`
  (diff) e depois `--confirm`. Publicou a **versão 2** (a 1 ficou no histórico): 33 nós novos (`driver_*`, `attendant_*`,
  `fala_*`), 0 removidos, 1 alterado (`driver_trip_menu`).
- **OCR do canhoto:** `CANHOTO_OCR_ENABLED` não está definida no worker de staging; vale o padrão (ligado fora de
  produção). Boot: `bot_canhoto_read.engine ready:true`. Memória (cgroup, limite 7629 MB): ocioso ~322 MB, pico
  ~406 MB em uma leitura de PNG sintético por `POST /internal/bot-canhoto-reads` (200 em ~0,7 s, `markers: 0` —
  a imagem sintética sem fonte na imagem Alpine não gera texto reconhecível, então o pico real com foto pode ser maior;
  o código documenta ~740 MB). Medir de dentro: `railway ssh -s worker -e staging`, `/sys/fs/cgroup/memory.current|peak|max`;
  `sharp` está em `/app/apps/worker-transportada/node_modules`, rode o script de lá com `bun`.
- **Ligar em produção:** definir `CANHOTO_OCR_ENABLED=true` no `worker` **e** na `api` (mesma regra nos dois) e
  redeployar; confirmar `engine ready:true` no log e reservar memória para ~740 MB por leitura. Exige aprovação.

## 5.20 Spec 294 em produção e leitura do canhoto ligada (05/11/2026)

- Promoção #543 (`2c33b1d94`). O job `mark-deployed` falhou na 1ª tentativa por erro do GitHub ao gravar
  `refs/deploy/production/api` ("fatal error in commit_refs"); os serviços já estavam no ar. `gh run rerun <id> --failed`
  resolveu (2ª tentativa `success`).
- Grafo da conversa individual republicado: `ENV_NAME=production producao-publicar-falas-do-bot.sh` (diff: 5 nós
  `attendant_*` adicionados) e `--confirm` → **versão 2**; a simulação seguinte deu "nenhuma mudança".
- **A leitura do canhoto não subiu só com `CANHOTO_OCR_ENABLED=true`.** A rota do worker só existe com o token do canal
  interno API→worker, que produção nunca teve (a transcrição de áudio do bot também não estava configurada). Configurado:
  - `BOT_AUDIO_TRANSCRIPTION_TOKEN` (64 hex, gerado com `openssl rand -hex 32` direto nas variáveis, sem aparecer) no
    `worker` e na `api` — o mesmo valor nos dois (conferido por hash);
  - `WORKER_INTERNAL_URL=http://worker.railway.internal:8080` na `api`;
  - `railway redeploy -s worker` e `-s api` (produção).
- Conferido: log do worker `bot_canhoto_read.engine {"ready":true}` (23:28 UTC); da `api`, `POST
$WORKER_INTERNAL_URL/internal/bot-canhoto-reads` com o token e corpo vazio → **400** (token aceito; sem token a rota
  não existiria → 404). Efeito colateral desejado: a transcrição dos áudios do bot passa a funcionar em produção.
- Memória (medida em staging, imagem sintética 3000×4000): pico 774 MB; worker de produção ~285 MB ocioso, limite 8 GB.

## 5.21 Conferir os certificados de todos os domínios de produção (06/11/2026) — somente leitura

Resultado de 06/11/2026: os 7 domínios (`fernandes-transportadora.com.br`, `www`, `api`, `app`, `auth`,
`cliente`, `motorista`) servem certificado Let's Encrypt válido, com o nome certo no SAN e verificação TLS
OK. O mais próximo de vencer é `cliente` (13/12/2026); o Railway renova sozinho. A resposta vem de
`railway-hikari` e sem cabeçalho da Cloudflare, ou seja, os registros estão **DNS only** (ver
`docs/ops/dns.md`) e o modo SSL da Cloudflare não entra na conta.

Como repetir:

1. Status do certificado no Railway: MCP do Railway, `list-domains` e `domain-status` por serviço
   (`api`, `client`, `driver`, `landing`, `keycloak`, `transportada-frontend`, ambiente `production`);
   esperado `CERTIFICATE_STATUS_TYPE_VALID` e DNS `PROPAGATED`.
2. O que o visitante vê, na máquina do Anderson (precisa de `openssl` e `curl`; `dig` é opcional e vem em
   `sudo pacman -S bind`):
   `bash /home/miyazaki/Documents/personal/transportada/tmp/ops/producao-certificados-todos-dominios.sh`
   O script percorre os 7 domínios (verificação TLS, emissor, validade, SAN e cabeçalhos HTTP), grava em
   `tmp/ops/saidas/` e imprime só o caminho.
3. Sinal de problema: `Verify return code` diferente de 0, SAN sem o domínio, vencimento a menos de 15 dias,
   ou cabeçalho `cf-ray` (proxy da Cloudflare ligado por engano).

Varredura da zona inteira (inclui staging e hostnames legados), quando alguém vê
`ERR_CERT_COMMON_NAME_INVALID` no Chrome:
`bash /home/miyazaki/Documents/personal/transportada/tmp/ops/producao-certificados-zona-completa.sh`
Em 06/11/2026 só `firebird` e `pgsql` deram erro de nome: ainda apontam para IPs da KingHost
(herdados da zona antiga) e respondem com `*.kinghost.net`. São hostnames de banco do provedor antigo,
fora do app; candidatos a remover da Cloudflare com aval do Anderson. `mail`, `smtp`, `imap`, `pop`,
`webmail`, `ftp`, `autoconfig`, `autodiscover` e `mssql`/`mysql` constam em `docs/ops/cloudflare-import.zone`
mas não resolvem hoje.

O Claude não consegue consultar DNS/SSL da Cloudflare: o conector dele só cobre Workers, D1, KV e R2, e o
container não alcança os domínios. Para isso seria preciso um API token com Zone:Read e SSL/Certificates:Read.

## 5.3 Publicar o grafo do bot do WhatsApp (staging; produção só com aprovação)

O Postgres não tem proxy público e a imagem da api só leva o `dist`, então o
`apps/api-transportada/scripts/whatsapp-flow-publish.ts` é empacotado (`bun build`) e enviado ao container
por `railway ssh`. Script: `tmp/ops/staging-publica-grafo-whatsapp.sh <previa|adotar|publicar|sobrescrever chaves>`.

1. `previa` primeiro (não grava): confira nós adicionados/removidos/alterados e `fala_* regravados`.
2. `adotar` só na primeira publicação depois da spec 300 (o grafo vivo vira o baseline do código; recusado se o
   histórico tiver edição `source=panel`). Depois, `publicar`.
3. `sobrescrever fala_a,fala_b` leva o texto do código a chaves `fala_*` editadas no painel (spec 299).
4. Feito em 2026-11-07 em staging: versão 3 → 4 (21 falas regravadas, 2 nós novos da 299).

## 5.27 Quem pode confirmar como atendente no grupo do WhatsApp (10/11/2026) — somente leitura

O bot só reconhece como atendente o número de quem tem vínculo ativo, papel com `trip.report-on-behalf` (`company-admin`,
`operator`, `finance`) e WhatsApp **verificado** (`user_whatsapp_phones.verified_at`, válido por 90 dias). Para listar, rode
`bash /home/miyazaki/Documents/personal/transportada/tmp/ops/producao-atendentes-confirmam-canhoto.sh` (cópia em
`scripts/ops/`; grava `tmp/ops/saidas/producao-atendentes-confirmam-canhoto-<data>.json` e imprime só o caminho).
Em 10/11/2026 havia 4 pessoas com o papel na AFR Fernandes e **nenhuma** com WhatsApp verificado: a baixa pelo escritório no
grupo também não funcionava. O administrador grava o número de outra pessoa já verificado em Usuários → editar → WhatsApp
(`PUT /company-users/:id/whatsapp-phone`, `users.manage`, trilha `whatsapp_phone.bound_by_administrator`).

## 5.28 Cobrança no recebimento vai para Ressarcimentos (spec 317, 10/11/2026) — só staging, nada mudou em produção

O tipo de parada `unexpected_charge` ("Cobrança no recebimento") grava uma linha `receiving_charge` em Ressarcimentos, marca o cliente
(`delivery_clients.receiving_charge_flagged_at`) e não manda nada à contratante. A migration `20261110194838_receiving_charge_to_settlements`
é **aditiva** (enum, `delivery_charges.stop_occurrence_id`, `trip_stop_occurrences.declared_amount`, vagas e fotos, colunas da marca) e a
`main` ainda não a tem. **Produção só com aval do Anderson.**

- **Ordem de publicação (ADR-0081 §9):** painel → API → app do motorista. O painel antigo lança erro em `chargeType` desconhecido
  (`readChargeType`), então ele tem de estar publicado antes de qualquer tipo de cobrança no recebimento ser usado. O app novo com API antiga
  cai no formulário de sempre (sem `photoSlots` o tipo não abre a cobrança).
- **Promoção à `main`:** a migration roda sozinha no deploy da API (item 4, conferir o job `migrate`). Depois da promoção, o tipo só
  é usado se a empresa o tiver ativo; a semeadura renomeia apenas o nome padrão antigo.
- **Conferir depois de publicar (somente leitura):** no banco da API (item 2) `select count(*) from delivery_charges where charge_type = 'receiving_charge'`
  e `select count(*) from delivery_clients where receiving_charge_flagged_at is not null`. Antes do primeiro uso real, ambos dão 0.
  Qualquer script novo vai em `tmp/ops/` (saída em `tmp/ops/saidas/`), como o resto deste arquivo.
- **Limpar a marca de um cliente:** pelo painel (ficha do cliente → "Limpar a marca", `fleet.manage`) ou `DELETE /delivery-clients/:id/receiving-charge-flag`;
  a limpeza é auditada (`delivery-client.receiving-charge-flag.cleared`). Não limpe por SQL.
- **Linha duplicada ou foto faltando:** o reenvio pela mesma chave faz replay (índices únicos parciais), e foto obrigatória faltando devolve
  `422 STOP_OCCURRENCE_PHOTO_SLOT_MISSING` sem gravar nada. Motorista com app antigo vê o que falta em vez de perder a fila.
- **Desligar sem migration reversa:** desativar o tipo na aba Tipos de `/ocorrencias` (`active = false`); as linhas já criadas ficam em Ressarcimentos.
- Em produção **nada foi lido nem alterado** por esta spec até esta data.

## 5.26 Copiar a Única de produção para staging, para testar a ocorrência (spec 318, 10/11/2026)

Staging não tinha a contratante Única nem notas dela. `scripts/ops/staging-copia-unica-de-producao.sh [--confirm]` copia a
contratante (CNPJ 26344834000108), os contatos e as `NOTES` notas mais recentes (padrão 5) com o que elas precisam (participantes,
endereços, produtos, volumes e os pais por chave estrangeira).

- **Produção: somente leitura** (`set transaction read only`). **Staging:** sem `--confirm` roda tudo numa transação e desfaz (simulação).
- Anonimiza contatos (e-mail, telefone, nome), destinatários (nome, CPF, endereço, telefone, e-mail) e o texto livre da nota. O emitente (a Única) fica como é.
- Usuários viram o `anderson.fernandes` de staging e a empresa segue a de staging. Se a Única já existe em staging, usa a de lá.
- O XML das notas não é copiado (o balde de produção não é lido): a linha existe, o download do XML não.
- Saída completa em `tmp/ops/saidas/staging-copia-unica-<data>.txt` (e o JSON exportado ao lado); o script imprime só o caminho.
- Depois: configurar o canal WhatsApp na ficha da Única em staging (grupo e número) e criar uma viagem com essas notas para registrar a ocorrência.

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
| Esperar que o `realm.json` crie client novo num Keycloak já em uso                                               | O import ignora realm existente: criar pela API de administração (seção 5.15)                                                             |

- **"Não foi possível salvar" ao marcar como tratado um retorno `needs_operator` (29/10/2026).** Causa: o check
  `occurrence_contractor_replies_reason_check` só admite `reason` em `needs_operator`, e `markHandled` mudava o status
  para `handled` sem limpar o motivo (500). Corrigido zerando `reason` na mesma atualização.
- **"Não foi possível encaminhar" ao entregar ao motorista um retorno `needs_operator` (29/10/2026).** Mesma causa: a
  entrega ao motorista (`contractor-reply-driver-delivery.support.ts`, API e worker) mudava o status para `delivered`
  sem limpar `reason` e batia no mesmo check. Corrigido com `reason = null` na atualização.

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
`external_identities` com a conta de serviço do worker (`sub` `0c5fe9dc-d869-459e-b1ca-3161980f17d9`; **errado**: o vínculo
gravado foi com `706677ad-…`, um usuário comum do Keycloak — corrigido em 05/11, seção 5.17). Só
INSERT no banco do app; Keycloak intocado. Reverter: apagar essa membership e o vínculo.

`producao-renomear-usuarios-uuid.sh` rodou no mesmo dia e não achou nenhum username em UUID em
`identity_user_profiles` de produção: nada foi alterado. (Os UUIDs vistos eram só de staging.)

### Staging: e-mail só chega a quem está em `EMAIL_ALLOWED_RECIPIENTS` (31/10/2026)

O worker da **staging** descarta e-mail para endereço fora da variável `EMAIL_ALLOWED_RECIPIENTS` (separador vírgula;
produção proíbe a variável, `environment.schema.ts`). Sintoma: log `contractor_mail_recipient_not_allowed`
(`email_recipient_not_allowed`, `blocked: 1`) e o e-mail do cliente não chega. O MCP do Railway devolve só os **nomes**
das variáveis, então gravar a variável por ele apagaria a lista: o passo é sempre ler o valor atual (`railway variables
-s worker -e staging --json`) e acrescentar. Script deixado para o Anderson: `staging-allowlist-email.sh` em
`/home/miyazaki/Documents/personal/ativada/` (grava a saída em `saidas/`, imprime só o caminho). Depois do redeploy do
worker, "Tentar de novo" no e-mail que falhou. Endereço acrescentado em 31/10/2026: `andersonfrfilho@live.com`.

### Memória da leitura do canhoto e chave ligada em produção (05/11/2026)

OCR do canhoto (spec 294 T4.8, `POST /internal/bot-canhoto-reads` no worker). Medido na **staging** com imagem sintética
(JPEG 3000x4000, ~1,9 MB, inclinada, com ruído, texto do canhoto e assinatura riscada, gerada na máquina local com Pillow e
fonte Liberation Sans; a imagem Alpine do worker não tem fontes, então não se gera a imagem lá dentro). A imagem vai por
base64 no stdin de `railway ssh -s worker -e staging -- sh` e um script `bun` dentro do container chama a rota em
`http://[::1]:$PORT` com `BOT_AUDIO_TRANSCRIPTION_TOKEN` do próprio ambiente (nunca impresso), lendo `memory.current`
e `memory.peak` do cgroup a cada 200 ms.

- 5 leituras em sequência: `markers=2`, casamento exato da NF 123456, 200 em todas; latência 2,6 s (1ª), depois 1,6 a 1,9 s.
- 2 simultâneas: uma 200 (1,7 s), a outra 503 `BUSY` em 0,2 s (regra da fila).
- Memória do worker de staging (OCR carregado): ocioso 451 a 469 MB, durante a leitura até 722 MB, `memory.peak` 774 MB.
- Limite (cgroup `memory.max`) 8000 MB em staging e em produção. Produção ociosa (OCR desligado): 285 MB, pico histórico 361 MB.
- Conta: (774 + 285) x 1,3 = ~1,4 GB, contra 8 GB. Folga larga, liberado.

Produção: `CANHOTO_OCR_ENABLED=true` gravada em `worker` e `api` com `railway variables --set ... --skip-deploys`
(sem redeploy; vale quando a spec 294 for promovida e os serviços subirem). Reverter: `--set CANHOTO_OCR_ENABLED=false`.

### Staging: usuário de teste com papel Motorista fora da frota (06/11/2026)

A listagem da frota parte de `fleet_drivers`, não dos usuários do Keycloak. O papel "Motorista" só vira ficha no convite (com CPF
e ficha órfã de mesmo CPF, `linkFleetDriver`); trocar papel depois não cria nem liga ficha. Usuário de teste com o papel e sem
ficha fica fora da frota. Produção conferida em 05/11: nenhum usuário com papel de frota sem ficha
(`producao-motorista-fora-da-frota.sh`). Para criar a ficha em **staging** ligada ao usuário `anderson.fernandes`:
`CPF=<11 dígitos> TELEFONE=<DDD+número> bash tmp/ops/staging-cria-ficha-motorista-teste.sh` (idempotente; só INSERT; telefone
no banco é 10 ou 11 dígitos, sem 55, `fleet_drivers_phone_check`). Criada em 06/11/2026 com CPF fictício `52998224725` e telefone
`16993056772`. Reverter: apagar a linha de `fleet_drivers` com esse `membership_id`.

## 5.22 Nota bipada vem da SEFAZ (spec 298, 06/11/2026)

**Publicada em produção em 06/11/2026** pelo PR #557 (merge `e849ac779`, deploy run 42298117859, todos os jobs verdes,
migration `20261106120034_nfe_access_key_lookups` aplicada pelo `preDeployCommand` da API). Foi junto com as specs 218 e 294.
Primeiro uso real a acompanhar: bipar uma chave de 06/11 e conferir o desfecho em `nfe_access_key_lookups`
(`status`, `reason`) e o orçamento em `nfe_access_key_lookup_budgets`; 656 não deve aparecer.

**Consulta de uma chave na SEFAZ de produção (T0.1).** É leitura, mas gasta 1 das 20 consultas por hora do CNPJ. Passar
de 20 dá cStat 656 e bloqueia a distribuição inteira por 1 h, e consultar durante o bloqueio reinicia a hora.

```bash
bash /home/miyazaki/Documents/personal/ativada/producao-consulta-por-chave.sh <chave de 44 dígitos>
```

O script entra no worker por `railway ssh`, usa o certificado de distribuição (decifrado só em memória) e imprime só
`ambiente`, `cStat`, `xMotivo` e `schema`.

- Exige terminal interativo e a palavra `sim`.
- Com mais de uma empresa no banco, passe `COMPANY_ID=<uuid>`.
- Sem linha de resultado, sai com erro: a consulta pode ter contado no limite, então não repita às cegas.

**O que o cStat quer dizer:**

| cStat ou schema | O que é                                          |
| --------------- | ------------------------------------------------ |
| `procNFe`       | nota completa                                    |
| `resNFe`        | só o resumo; a operação envia o XML              |
| 640             | a transportadora não consta na nota; envie o XML |
| 217             | chave inexistente                                |
| 632             | fora de 90 dias                                  |
| 653             | cancelada                                        |
| 654             | denegada                                         |
| 593             | certificado não bate                             |
| 656             | limite estourado; esperar 65 min                 |

**Orçamento e bloqueio.** A tabela `nfe_access_key_lookup_budgets` (`company_id`, `environment`) guarda o orçamento: no
máximo 15 consultas por chave por hora corrida. O bloqueio de 656 fica em `blocked_until` e vale também para a
importação automática (distNSU).

Conferir, somente leitura:

```sql
select environment, window_started_at, used_in_window, blocked_until
from nfe_access_key_lookup_budgets;
```

**Buscas presas.** O estado de cada busca fica em `nfe_access_key_lookups`. `waiting` com `not_before` no passado volta
para a fila sozinha na rotina de distribuição. Se aparecer `querying` parado há mais de 15 min, é falha do worker: ver os
logs (`nfe_access_key_lookup_finished`, `nfe-access-key.v1`) e a fila de mensagens mortas `nfe-access-key`.

**Publicação.** A ordem é banco/API → worker → painel. A migration `20261106120034_nfe_access_key_lookups` é aditiva.
O rollback está ao lado; ele reclassifica `access_key` para `upload` e só roda com aprovação.

## 5.23 XML de NF-e por e-mail e por WhatsApp (spec 301, 08/11/2026)

Dois canais novos, mesma importação da tela "Enviar XML". Tudo que chega vira uma linha em `nfe_xml_receipts` e o worker
processa em lotes, a cada 60 s (trava `pg_try_advisory_xact_lock`, então duas réplicas não duplicam). Nada é recusado por
volume; zip grande é fatiado. Recusa só por segurança: remetente não autorizado, arquivo que não é `.xml`/`.zip`, zip hostil,
arquivo acima de 50 MB.

**E-mail.** Caixa `notas@<domínio de entrada>` (a parte local é `notas`). Precisa de: roteamento de entrada do domínio no Resend
apontando para o webhook já existente; o ator `automation` (`00000000-0000-4000-8000-000000000006`) com vínculo ativo em cada
empresa; remetente com papel `company-admin`, `fiscal` ou `operator` e DKIM alinhado.

**WhatsApp.** Funciona em qualquer grupo em que o bot esteja (marcando o bot) e na conversa direta. O número precisa estar verificado
(`user_whatsapp_phones.verified_at` há menos de 90 dias) com vínculo ativo e papel que importa nota.

**Acompanhar (somente leitura):**

```sql
select channel, status, count(*), min(created_at) from nfe_xml_receipts group by 1, 2 order by 1, 2;
select id, channel, status, attempts, error_code, next_attempt_at from nfe_xml_receipts
 where status in ('failed', 'processing') order by updated_at desc limit 20;
```

- `processing` parado há mais de 15 min volta sozinho para `pending` no próximo ciclo.
- `failed` é definitivo (5 tentativas): gera aviso `fiscal.nfe-xml-receipt-failed` aos usuários `company-admin` e `fiscal`.
- Logs do worker: `nfe_xml_receipt_*` (`retry`, `failed`, `imported`), sem número, nome de arquivo nem XML.
- O painel mostra os recibos recentes na página de NF-e (`GET /v1/nfe-xml-receipts`).

**Publicação.** Ordem: banco/API (migrations `20261108144212` e `20261108151552`, aditivas) → worker → painel. Passa por `staging`
primeiro. Rollback de `20261108151552` só com a tabela vazia (a guarda recusa o contrário).

**Ator `automation` de sistema em produção (09/11/2026).** Conferido com `tmp/ops/producao-automation-xml-confere.sh` (somente leitura): o ator `00000000-0000-4000-8000-000000000006` existe (`active`) e tem membership `active` na única empresa ativa (`ce523659-…`); `pronto: true`. `producao-automation-xml-cria.sh` (inserts idempotentes, exige digitar `producao`) foi rodado pelo Anderson em seguida e não mudou nada além do `updated_at` da membership. Nada a criar. Caixa de e-mail escolhida: `notas@resposta.fernandes-transportadora.com.br` (domínio `resposta.` verificado no Resend com recebimento ligado e webhook para a API de produção); sem alias no Zoho e sem `NFE_XML_MAILBOX_DOMAINS`. Saídas em `tmp/ops/saidas/producao-automation-xml-*-20261109-*.json`.

**Contratante envia XML (spec 302).** Quem a transportadora marcar com o tipo **"Pode enviar XML de NF-e"** no contato do contratante (tela de contatos do contratante) importa XML pelos dois canais, sem ser usuário: contato `active`, com o tipo e, no WhatsApp, com o aceite do WhatsApp. A importação sai com o ator `automation` e o remetente em `received_from`. Para revogar, desmarque o tipo ou inative o contato. Migration `20261108161438_contractor_contact_nfe_xml` é aditiva (amplia o CHECK); o rollback recusa enquanto algum contato tiver o tipo.

## 5.24 O bot atende no chat direto do Evolution (spec 308, 08/11/2026) — só staging, nada mudou em produção

O motorista (e quem tem envio de XML liberado) que escreve ao número do bot no 1:1 passa a receber o mesmo atendimento do
grupo. **Produção não tem Evolution**, então nada disso está ligado lá e nada foi feito em produção nesta spec (sem
variável nova, sem migration). A entrega é PR em `staging`; para a `main` só com pedido do Anderson.

- Guia e conferências: `docs/runbooks/evolution-staging.md`, seção "O motorista no chat direto com o número do bot".
- Conferência de staging pronta (somente leitura): `bash /home/miyazaki/Documents/personal/transportada/tmp/ops/staging-chat-direto-confere.sh`
  (saída em `tmp/ops/saidas/`; números mascarados).
- Quando a spec for promovida à `main` (Evolution ainda desligado lá): nenhum passo manual; conferir só que
  `whatsapp_evolution.direct_message` não aparece nos logs de produção.

## Liberar um domínio de e-mail a enviar XML de NF-e (spec 311)

- Migration `nfe_xml_allowed_email_domains` (aditiva). Depois do deploy, simular e gravar:
  `bash /home/miyazaki/Documents/personal/transportada/tmp/ops/liberar-dominio-xml.sh production empresa.com.br`
  e, para gravar, o mesmo comando com `--apply` (digitar `sim`). `listar` mostra os domínios da empresa.
- Provedor público (gmail, hotmail etc.) é recusado pelo banco. Subdomínio não herda. O DKIM alinhado segue obrigatório.

## Perfis CT-e da UNICA por região e conferência de recibos de XML (spec 312, 09/11/2026)

Feito em produção em 09/11/2026 por `cadastrar-perfis-unica.sh` (copiado de `ops-scripts/` da branch `work/unica-script`
para `tmp/ops/`):

- Dois perfis ativos para o CNPJ 26344834000108: "UNICA Ribeirão Preto 5%" (93 cidades) e "UNICA São José do Rio Preto 6%"
  (142 cidades), cada um com a sua regra de frete (0,05 e 0,06). Clonados do perfil ativo da SPANI (raiz 05868574), que não
  foi alterado. Cidade fora das 235 fica bloqueada com `CTE_PROFILE_CITY_NOT_COVERED`.
- O script não grava `audit_logs`. Sem `--apply` ele roda tudo numa transação e desfaz. Staging primeiro, depois produção.
- Dependia das migrations `20261109141702_cte_profile_destination_cities` e
  `20261109163000_cte_profile_matcher_per_city` (esta solta a unicidade CNPJ + papel dos matchers; o sistema passou a
  recusar `CTE_PROFILE_MATCHER_CONFLICT` se as listas de cidades se cruzam).
- Pela tela: o formulário do perfil tem o campo "Cidades de destino", uma por linha, `Cidade/UF`.

Conferir recibos de XML sem o painel: `tmp/ops/recibos-xml-por-remetente.sh <staging|production> <trecho do remetente>`
(canal, remetente, status, motivo, arquivos, horário, aviso e resumo enviados). O e-mail da UNICA (unicafs.com.br) é recusado
por DKIM (`sender_not_authenticated`); liberar domínio não resolve, o TI deles precisa corrigir. O WhatsApp funciona.
Dica: o `ls` do Anderson tem alias; use `command ls` ao listar `tmp/ops/saidas/`.

## Entrada de XML por e-mail e WhatsApp: domínio liberado e emitente contratante (specs 311–313)

- **Domínio liberado** (tela de NF-e, bloco "E-mails liberados a enviar XML"): cada domínio fica amarrado a um contratante. Nota de remetente daquele domínio só entra se o emitente (CNPJ da chave) for o contratante amarrado; senão a recusa é `NFE_IMPORT_ISSUER_NOT_CONTRACTOR`. Coluna `nfe_imports.restricted_contractor_id`.
- **Emitente contratante conta como da empresa**: o consumidor aceita a nota cujo emitente é contratante ativo da empresa mesmo sem o CNPJ da empresa no XML (a SEFAZ não entrega essas notas). Emitente desconhecido segue recusado com `NFE_IMPORT_UNRELATED_CNPJ`.
- **Por que um recibo diz "com problema"**: `ops-scripts/notas-com-problema-xml.sh <ambiente> <horas>` (somente leitura) agrupa os itens por status e código de erro; grava em `tmp/ops/saidas/`.
- **Reprocesso**: a rota de reprocesso só refaz item `failed`. Item `rejected` não volta pela rota. Pela tela (spec 314, na staging): o botão "Reprocessar" da fila de processamentos também vale para nota recusada com `NFE_IMPORT_UNRELATED_CNPJ`, mostra quantas serão refeitas e só grava no "Confirmar". O script abaixo segue como plano B em lote. Para as notas recusadas com `NFE_IMPORT_UNRELATED_CNPJ` (emitente contratante, antes do #626): `bash tmp/ops/producao-reprocessa-recusadas.sh [horas]` (padrão 72). Simula primeiro (só conta) e só grava depois do "sim": põe a importação em `queued` e republica `transportada.nfe.import.requested` no `processing_outbox`; o consumidor relê todos os itens. Só entram importações em que **todos** os itens são essa recusa (senão uma nota já importada viraria "duplicada"). Saída em `tmp/ops/saidas/reprocessa-recusadas-<data>.txt`; confira depois com `notas-com-problema-xml.sh`.

⚠️ **Script de operação que roda no container do worker não importa de `dist/` além dos entrypoints.** O build empacota (`bun build … --packages=external`) só `main.js` e os `*.main.js`/workers listados no `package.json`; não existe `dist/database/*.js` nem `dist/config/*.js`. Um `import(`${DIST}/database/nfe.schema.js`)` falha com `Cannot find module` (foi o primeiro erro do `producao-reprocessa-recusadas`, 10/11/2026). Use SQL cru com `drizzle-orm` (`sql`) e os nomes de coluna do banco; `producao-consulta-por-chave.mjs` ainda importa de `dist/` e precisa da mesma troca antes de ser usado.

## 5.25 Painel em "Indisponível" com 401: sessão do Keycloak vencida (10/11/2026)

**Sintoma:** Workspace NF-e e notificações em "Indisponível / Não foi possível carregar"; no console, 401 em `/auth/me`, `/v1/notifications/unread-count` e `/view-preferences`. A API e o Keycloak estavam saudáveis.

**Causa:** o realm de produção estava com o padrão do Keycloak: sessão morre com **30 min parada** (`ssoSessionIdleTimeout` 1800) e teto de 10 h. A renovação do token devolve `Token is not active` e a API (que só valida a assinatura, sem consultar o Keycloak) passa a responder 401. O "continuar conectado" só vale se a pessoa marcar a caixa.

**Correção (10/11/2026):**

- Produção ajustada à mão para ociosidade **8 h** (28800) e teto **7 dias** (604800) com `APLICAR_SESSAO=1 bash tmp/ops/producao-keycloak-eventos.sh` (PUT 204, conferido na leitura seguinte).
- `deploy/keycloak/realm.json` e `.github/scripts/keycloak-reconcile.sh` passaram a declarar os mesmos prazos (PR #636), então staging e instalação nova não voltam ao padrão.
- O painel, ao receber 401 com token que o navegador acha válido, reautentica uma vez por minuto (PR #634 na staging, #635 na `main`).

**Scripts** (em `tmp/ops/`):

- `producao-keycloak-sessao.sh` — somente leitura: prazos do realm, client `transportada-spa`, chaves e eventos.
- `producao-keycloak-eventos.sh` — escreve: liga eventos de login/renovação (14 dias) e, com `APLICAR_SESSAO=1`, ajusta a sessão.
- `producao-thiago-falhas.sh` — somente leitura: eventos de campo de um motorista (paradas, status, ocorrências) em 36 h.

⚠️ **Eventos do Keycloak seguem desligados:** a conta de serviço da API recebe 403 em `/events/config` (falta `manage-events` do client `realm-management`, ou ligar à mão em _Realm settings → Events_). Sem eles, um 401 com token ainda válido não deixa rastro.

**Bun SQL:** em `Bun.SQL`, lista em `IN` é `in ${sql(arr)}`; `any(${arr})` dá `malformed array literal`.

## 5.26 Veículos com "Peso sem teto de carga" / "Volume sem carroceria cadastrada" (10/11/2026)

Os avisos vêm da lista de viagens (ocupação): `capacity_kg = 0` dá o aviso de peso e `body_type = '00'` fora do
cavalo dá o de volume (`resolveCapacityUnknownReason`). Dado faltando na ficha, não bug do painel.

- Listar a frota e propor valores (somente leitura): `tmp/ops/producao-veiculos-pendentes.sh` — usa `railway ssh -s api -e production`,
  script `bun` em base64, `sql.begin('read only')`; propõe por veículo igual (marca+modelo) ou referência do tipo.
- Corrigir: `tmp/ops/producao-veiculos-corrigir.sh` (prévia por padrão, `--apply` grava em transação; só toca veículo ainda
  com `body_type='00'` e `capacity_kg=0`; incrementa `version`). Valores aprovados pelo Anderson. Aplicado em 10/11/2026 nas placas
  FLU7H32, FPA9H77, CAH8I08, FNG3980, FMN6C46 (tipo `other`→`van`), GFT4A58 e RFJ1B74 (tipo `other`→`utility`).
- Completar só as medidas do baú de 6 veículos que já tinham carroceria e peso: `tmp/ops/producao-veiculos-medidas.sh [--apply]`
  (Fiorinas DGC4I33, HIC2C79, FVB5I89 e Masters FFV2D95, PFM6A08 a partir de veículo igual já medido; Ducato Cargo IUZ9D73 pela referência da van).
  Só toca veículo com as três medidas zeradas e incrementa `version`.
- ⚠️ Medidas do Besta (CAH8I08) e do Ducato Maxicargo (FNG3980) foram derivadas do volume informado (5,2 m³ e ≈13 m³): conferir com fita.
- Saídas ficam em `tmp/ops/saidas/veiculos-*.txt`.

## 5.29 Promoção #678 staging → main (11/11/2026): o que foi para produção e como conferir

O #678 foi mergeado em 11/11/2026 às 02:29 UTC (merge `f8ddc02`). O deploy em produção e a conferência são do Anderson. As migrations rodam
sozinhas no `preDeployCommand` da API; a CI confere com `assert-migrations api`.

- **11 migrations novas**, todas aditivas, com `rollback.sql` ao lado: `contractor_occurrence_channels` (318), `occurrence_location_arrival` (315),
  `field_report_holds` (320), `salespeople` (316), `receiving_charge_to_settlements` (317), `occurrence_contractor_notice_block` (321 T1),
  `driver_occurrence_email_settings` (322), `canhoto_pickups` (321 T2), `whatsapp_chats` (319), `canhoto_pickup_resolution` (321) e
  `whatsapp_inbox_chat_expire_job` (319). A única que escreve em dado existente é a 317: `UPDATE` em `company_occurrence_types` do tipo
  `unexpected_charge` (renomeia "Cobrança inesperada" para "Cobrança no recebimento", exige valor pago, desliga o e-mail à contratante) e
  recria três CHECKs. Veja § 5.28.
- **Nasce desligado, nada muda sozinho em produção:**
  - **Trava de eventos atrasados (spec 320):** `company_field_report_hold_settings.hold_enabled` é `false` por padrão; sem linha não retém nada.
    Ligar é `PUT /company-settings/field-report-hold` e pede aprovação humana.
  - **Rotina `whatsapp-inbox.chat.expire` (spec 319):** entra em `job_schedules` com `enabled = false`, `paused_origin = 'system'`. Ligar pede
    a autorização do dono; até lá o chat que o atendente assume não volta ao bot por vencimento.
  - **Coleta de canhoto (spec 321):** `company_occurrence_types.creates_canhoto_pickup` é `false` em todo tipo; nenhum tipo passa a criar coleta.
  - **E-mail do aviso do motorista (spec 322):** sem linha em `company_driver_occurrence_email_settings` vale ligado, então ninguém muda de
    comportamento.
- **Já ativo desde o deploy:** o lembrete do motorista (spec 299, emenda D10). `DRIVER_REMINDERS_ENABLED=true` no `api` e a empresa ligada em
  `company_driver_reminder_settings` desde 10/11/2026 19:25 UTC. A varredura passa a cobrar também viagem `dispatched`/`in_transit` sem
  "Iniciar rota", na primeira rodada dentro do horário de funcionamento. O preview de 10/11 listou 5 viagens; a do Geyaon estava despachada
  havia 132 h. Para desligar: `DRIVER_REMINDERS_ENABLED=false` no `api` ou `enabled = false` da empresa.
- **Conferir depois do deploy (somente leitura):** `bash <repositório>/scripts/ops/producao-pos-promocao-678.sh` (copiado também para
  `tmp/ops/`). Esperado: 7 tabelas novas, `whatsapp-inbox.chat.expire` com `enabled = false`, nenhuma empresa com `hold_enabled`, 0 tipos com
  `creates_canhoto_pickup`, `unexpected_charge` renomeado, 0 chats em modo atendente. A saída vai para `tmp/ops/saidas/`.
- **Vermelhos da CI que apareceram na promoção e não eram dela:** o dublê padrão do smoke de viagem não cobria `/trip-canhoto-pickups`
  (#701) e a constante de consultas fixas do snapshot do motorista subiu de 26 para 27 com a T6 (#703). O teste do SIGTERM do worker
  (`sigterm.integration.ts`) estourou o prazo uma vez e passou na repetição.

## 5.27 Eventos velhos do app do motorista (spec 320, 10/11/2026) — leitura em produção, nada alterado

O motorista 87 reenviou pelo app, em 10/11/2026 às 17:34 UTC, uma fila velha de toques. Duas leituras **somente de consulta** no banco de produção (`railway ssh -s api -e production`, `bun` com `DATABASE_URL` do próprio serviço), scripts em `tmp/ops/producao-motorista-eventos-atrasados.sh` e `producao-motorista-paradas-atrasadas.sh`:

- Os toques atrasados eram **saiu, chegou e entregou** de três paradas (`tapped_at` de 09/11 e 10/11, gravados em 10/11 às 17:34 UTC), todos do canal `driver_app`. A etapa pulada foi gravada junto, com a mesma hora do toque.
- Nessas três paradas não há evento de outro canal e nenhuma ocorrência de nota nos documentos delas: **não há duplicata para limpar**, e nada foi apagado ou alterado.
- A trava da spec 320 retém só **ocorrência de nota** (decisão do dono); saiu, chegou e entregou atrasados continuam entrando. Estender é uma mudança pequena, mas pede decisão.
- Armadilha do script: `railway ssh` precisa rodar de dentro da pasta do repositório (projeto ligado); o script agora entra nela sozinho. Lista de ids no `bun` SQL é `in ${sql(lista)}`, não `= any(${lista}::uuid[])`.
- Interruptor da trava: `GET`/`PUT /company-settings/field-report-hold` (`settings.manage`) e a caixa em Pendências. Desligado por padrão em toda empresa; ligar em produção pede aprovação humana.
