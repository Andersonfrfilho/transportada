# Backup de emergência

Procedimento manual, para quando não dá para esperar a janela automática. Vale tanto antes de a
feature 029 entregar o serviço `backup` quanto depois, quando ele existir e estiver quebrado.

> ⚠️ Estado em 08/08/2026: **staging** tem ciclo automático (serviço `backup`, 06:00 UTC).
> **Production ainda não** — até a T018 da feature 029 subir o serviço lá, este documento é o
> único backup que production tem.

## Quando usar

- Antes de aplicar migration com `DROP`, mudança de tipo ou remoção de constraint.
- Antes de um deploy que promove muitos commits de uma vez.
- Ao suspeitar de corrupção, perda ou escrita indevida.
- Quando o ciclo automático falhou e a próxima janela está longe demais.
- Antes de qualquer mexida manual em dado de production por `psql`.

## Antes de começar

Tenha à mão, e confira que **tem** antes de precisar:

| Item                      | Onde está                                                               |
| ------------------------- | ----------------------------------------------------------------------- |
| `railway` CLI autenticado | `railway whoami`                                                        |
| `pg_dump` **18**          | `psql --version` — o servidor é `postgres-ssl:18`; cliente antigo falha |
| `openssl`                 | qualquer versão recente                                                 |
| `aws` CLI                 | para falar com os buckets do Railway                                    |
| `jq`                      | as credenciais de bucket saem em JSON, e não devem passar pelo terminal |
| `docker`                  | o ensaio da R2 exige um Postgres 18 descartável                         |
| `BACKUP_ENCRYPTION_KEY`   | gerenciador de senhas — **sem ela o dump é lixo cifrado**               |
| `ENCRYPTION_KEYRING_JSON` | gerenciador de senhas — sem ela o certificado A1 é irrecuperável        |

Os dois bancos de production, para não confundir na hora errada:

| Serviço         | O que guarda                   |
| --------------- | ------------------------------ |
| `Postgres-Hqfu` | banco da aplicação             |
| `Postgres-FDoz` | banco do Keycloak (identidade) |

Em staging são `Postgres` e `Postgres-q0RQ`. **Os dois entram no backup.** Restaurar só o da
aplicação devolve o dado e deixa todo mundo sem conseguir entrar.

## Caminho A — com o serviço `backup` (depois da feature 029)

O ciclo é one-shot, mas **`railway redeploy` não o executa**: em serviço com `cronSchedule` o
redeploy só publica uma nova versão e fica esperando a próxima janela — o deploy fica `SUCCESS`
sem uma linha de log, que é o jeito mais convincente de parecer que rodou.

Disparar fora da janela é _Run now_ no dashboard (serviço `backup` → deployment ativo). Sem
dashboard à mão, a mesma coisa pela API:

```bash
# 1. Descobrir o serviceInstanceId do `backup` no ambiente certo.
PROJECT_ID=$(railway status --json | jq -r .id)
gql() { jq -n --arg q "$(cat)" '{query: $q}' \
  | curl --silent --show-error --data @- \
      --header "Authorization: Bearer $(jq -r '.user.token // .user.accessToken' ~/.railway/config.json)" \
      --header 'Content-Type: application/json' https://backboard.railway.com/graphql/v2; }

printf 'query { project(id: "%s") { environments { edges { node { id name } } }
  services { edges { node { name serviceInstances { edges { node { id environmentId } } } } } } } }' \
  "$PROJECT_ID" | gql | jq -r '.data.project
    | (.environments.edges | map({(.node.id): .node.name}) | add) as $envs
    | .services.edges[].node | select(.name == "backup")
    | .serviceInstances.edges[].node | "\($envs[.environmentId])\t\(.id)"'

# 2. Executar agora.
printf 'mutation { deploymentInstanceExecutionCreate(input: { serviceInstanceId: "%s" }) }' \
  "$SERVICE_INSTANCE_ID" | gql
```

O token sai do config do CLI e entra por `--data @-`/header, nunca em argv — `ps` do sistema lê argv.

Os logs de execução saem por deployment, não por serviço (`railway logs --service backup` devolve
vazio), e a mensagem vem no JSON, não no texto:

```bash
DEPLOYMENT_ID=$(railway deployment list --service backup --environment production --json | jq -r '.[0].id')
railway logs -d "$DEPLOYMENT_ID" --json | jq -r 'select(.event) | "\(.event) \(.database // "") \(.step // "")"'
```

Espere `backup_cycle_completed` para os dois bancos. Se aparecer `backup_cycle_failed`, leia o
campo `step` e vá para o Caminho B — não insista no automático durante uma emergência.

## Caminho B — break-glass, sem o serviço

Hoje **nenhum** dos Postgres tem TCP proxy (`railway variables` não devolve nenhuma variável
`*_PROXY_*`), e é assim que tem de ser: a regra de segurança §5 manda o banco sem exposição
pública. Para dumpar de fora do projeto é preciso abrir o proxy e **fechar depois** — o fechamento
faz parte do procedimento, não é arrumação posterior.

### B1. Abrir o acesso temporário

Dashboard → serviço do Postgres → _Settings_ → _Networking_ → habilitar o TCP Proxy. Anote host e
porta. Depois:

```bash
export PGURL_APP=$(railway variables --service Postgres-Hqfu --environment production --json \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["DATABASE_PUBLIC_URL"])')
```

Se `DATABASE_PUBLIC_URL` não aparecer, o proxy ainda não subiu — espere e repita.

### B2. Dump dos dois bancos

```bash
STAMP=$(date -u +%Y-%m-%d_%H%M)
pg_dump "$PGURL_APP" --format=custom --no-owner --file="app-${STAMP}.dump"
pg_restore --list "app-${STAMP}.dump" > /dev/null && echo "dump da aplicação íntegro"
```

Repita para `Postgres-FDoz`, trocando o nome do arquivo para `keycloak-${STAMP}.dump`.

`--format=custom` já vem comprimido e permite restauração seletiva. `--no-owner` evita depender do
mesmo papel no destino.

### B3. Cifrar

```bash
for f in app-${STAMP}.dump keycloak-${STAMP}.dump; do
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$f" -out "$f.enc"
  shasum -a 256 "$f.enc" > "$f.enc.sha256"
  rm "$f"
done
```

O `rm` do dump em claro não é zelo: um dump de production no disco de um laptop é um vazamento
esperando acontecer.

### B4. Guardar em dois lugares

O nome do recurso na Railway (`transportada-afr-fernandes-backups`) **não** é o nome S3: este leva
um sufixo aleatório, e é ele que o `aws` quer. Tire os dois do mesmo lugar:

```bash
railway bucket credentials --bucket transportada-afr-fernandes-backups --json > /tmp/bucket.json
export AWS_ACCESS_KEY_ID=$(jq -r .accessKeyId /tmp/bucket.json)
export AWS_SECRET_ACCESS_KEY=$(jq -r .secretAccessKey /tmp/bucket.json)
export AWS_REGION=$(jq -r .region /tmp/bucket.json)
BUCKET=$(jq -r .bucketName /tmp/bucket.json)
ENDPOINT=$(jq -r .endpoint /tmp/bucket.json)

aws s3 cp "app-${STAMP}.dump.enc" \
  "s3://${BUCKET}/db-backups/production/manual/" --endpoint-url "$ENDPOINT"
rm -f /tmp/bucket.json
```

O segmento do ambiente no caminho não é organização, é isolamento: o mesmo bucket serve staging e
production, e o teste mensal restaura a última linha de `db-backups/<ambiente>/manifest.jsonl`.
Backup manual jogado na raiz vira o backup de ninguém.

O bucket vive no projeto Railway `transportada-ops`, separado do ambiente que ele protege. Repita
para o `.sha256` e para o dump do Keycloak.

**A segunda cópia não é opcional.** Bucket de ops e ambiente de production estão na mesma conta
Railway: separar o projeto protege contra apagar o ambiente errado, não contra perder a conta.
Leve uma cópia para disco cifrado ou para o gerenciador de arquivos da empresa — é a única que
sobrevive ao cenário em que o Railway é justamente o que se perdeu.

### B5. Fechar o acesso — obrigatório

Dashboard → mesmo serviço → _Networking_ → **remover o TCP Proxy**. Depois confirme:

```bash
railway variables --service Postgres-Hqfu --environment production --json \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print([k for k in d if "PROXY" in k or "PUBLIC" in k])'
```

Tem de imprimir `[]`. Banco de production com proxy aberto e esquecido é o incidente seguinte.

## O que o dump **não** salva

O `pg_dump` leva o dado. Não leva nada disto, e sem estes itens o dado restaurado não volta a
funcionar:

| Item                              | Consequência de perder                                                    |
| --------------------------------- | ------------------------------------------------------------------------- |
| `ENCRYPTION_KEYRING_JSON`         | Todo certificado A1 vira envelope indecifrável (ADR-0004)                 |
| `IDEMPOTENCY_HMAC_KEY`            | Chaves de idempotência antigas param de casar                             |
| XML fiscal no bucket              | O banco referencia `bucket`/`key`; sem o objeto, o documento não existe   |
| Configuração do realm feita à mão | `--import-realm` ignora realm existente e não reconstrói o que foi manual |
| Variáveis de ambiente do Railway  | Reconstituídas a partir de `docs/spec/railway.md` § Variáveis             |

Por isso o backup do banco sozinho **não** é o backup do produto. As duas linhas seguintes fazem
parte do mesmo procedimento.

### Espelhar o bucket fiscal à mão

A credencial da Railway é **por bucket** — a do bucket fiscal recebe `AccessDenied` no espelho, e
vice-versa. Um `aws s3 sync` entre os dois numa tacada não existe: só um par de credenciais entra
no comando. O espelho passa pelo disco, em dois passos:

```bash
# Origem: bucket fiscal do ambiente, no projeto `transportada`.
railway bucket credentials --bucket transportada-<ambiente> --json > /tmp/origem.json
AWS_ACCESS_KEY_ID=$(jq -r .accessKeyId /tmp/origem.json) \
AWS_SECRET_ACCESS_KEY=$(jq -r .secretAccessKey /tmp/origem.json) AWS_REGION=auto \
  aws s3 sync "s3://$(jq -r .bucketName /tmp/origem.json)" ./fiscal-mirror \
    --endpoint-url "$(jq -r .endpoint /tmp/origem.json)"

# Destino: `transportada-afr-fernandes-fiscal-mirror`, no projeto `transportada-ops`.
railway bucket credentials --bucket transportada-afr-fernandes-fiscal-mirror --json > /tmp/destino.json
AWS_ACCESS_KEY_ID=$(jq -r .accessKeyId /tmp/destino.json) \
AWS_SECRET_ACCESS_KEY=$(jq -r .secretAccessKey /tmp/destino.json) AWS_REGION=auto \
  aws s3 sync ./fiscal-mirror "s3://$(jq -r .bucketName /tmp/destino.json)/<ambiente>" \
    --endpoint-url "$(jq -r .endpoint /tmp/destino.json)"

rm -rf ./fiscal-mirror /tmp/origem.json /tmp/destino.json
```

Nunca com `--delete`: o XML autorizado é imutável (ADR-0006), então sumir na origem é anomalia, e
um espelho que replica remoção propaga o acidente. E o `rm -rf` no fim vale o mesmo que o do dump
em claro — XML fiscal parado no disco de um laptop é vazamento.

### Copiar a keyring

Ela sai do Railway e vai para o gerenciador de senhas — nunca para o repositório, nunca para o
terminal compartilhado, nunca para um canal de chat. Segredo que apareceu em log é segredo
queimado (regra de segurança §4).

**Local da cópia de production:** Chaveiro do macOS do responsável pelo produto, serviço
`TransportAdA production`, um item por campo — `ENCRYPTION_KEYRING_JSON`,
`ENCRYPTION_ACTIVE_KEY_ID`, `IDEMPOTENCY_HMAC_KEY`, `RABBITMQ_DEFAULT_PASS`,
`KC_BOOTSTRAP_ADMIN_PASSWORD`, `KEYCLOAK_ADMIN_CLIENT_SECRET`, `POSTGRES_PASSWORD_APP`,
`POSTGRES_PASSWORD_KEYCLOAK` e os seis `OBJECT_STORAGE_*` — quatorze ao todo. É a única cópia que
sobrevive ao cenário em que a conta Railway é justamente o que se perdeu — bucket de ops não serve,
porque mora na mesma conta.

Os dois últimos nomes fogem do padrão de propósito: os dois Postgres de production expõem a mesma
variável `POSTGRES_PASSWORD`, e sem sufixo eles colidiriam num item só — o `-U` do `security`
sobrescreveria um com o outro, e a descoberta viria na emergência. `POSTGRES_PASSWORD_APP` é o
`Postgres-Hqfu`; `POSTGRES_PASSWORD_KEYCLOAK` é o `Postgres-FDoz`.

O Chaveiro só conta como segundo lugar porque a sincronia do iCloud está ligada
(`com.apple.Dataclass.KeychainSync`, `Enabled = 1`): sem ela a cópia morre junto com o laptop, que
é exatamente o cenário do qual ela deveria proteger. **Quem trocar de máquina confere isso antes de
considerar a cópia existente.**

Ler um campo na emergência, sem abrir o app:

```bash
security find-generic-password -s 'TransportAdA production' -a ENCRYPTION_KEYRING_JSON -w
```

Gravar de novo, depois de uma rotação, sem o valor passar por `argv` nem pelo histórico do shell —
o `security` lê a senha do stdin e pede duas vezes:

```bash
printf '%s\n%s\n' "$VALOR" "$VALOR" |
  security add-generic-password -s 'TransportAdA production' -a ENCRYPTION_KEYRING_JSON -U -w
```

O `ENCRYPTION_ACTIVE_KEY_ID` vai junto por um motivo prático: a keyring é um objeto com uma chave
por id, e sem saber qual está ativa a reposição é chute. Ele é hoje `production-v2` — a primeira
keyring foi rotacionada em 09/08/2026, antes do primeiro deploy, porque a original apareceu num
terminal (regra de segurança §4). **A cópia do Chaveiro é a fonte do valor corrente; o id acima
envelhece a cada rotação e o Railway é o desempate.**

Rotação normal **acrescenta** o id novo ao objeto sem remover o anterior (ADR-0004): a chave velha
continua sendo a única capaz de abrir o que foi cifrado com ela. A rotação de 09/08/2026 pôde
substituir o objeto inteiro por uma razão que não se repete — nada tinha sido cifrado ainda, os dois
bancos de production estavam com zero tabelas em `public`. Fora desse caso, remover id em uso é
transformar certificado A1 em envelope indecifrável.

Os valores nasceram fora do painel, num arquivo `600` no disco de quem gerou, só para a
transferência, e o arquivo foi apagado com `rm -P` assim que os campos foram conferidos por leitura
de volta. Disco de laptop não é o segundo lugar: é o primeiro lugar a vazar.

## Restauração de emergência

Ordem, porque ela importa: identidade antes de aplicação. Restaurar o banco da aplicação primeiro
deixa a janela em que existe dado sem ninguém autorizado a vê-lo.

### R1. Escolher o ciclo, decifrar e conferir

O ciclo sai da **última linha do manifesto do ambiente**, nunca do objeto mais novo do bucket: um
ciclo que morreu entre o upload da aplicação e o do Keycloak deixa `.enc` órfão e nenhuma linha, e
restaurar esse órfão é restaurar metade do produto achando que voltou inteiro.

```bash
# Credenciais como na B4; $BUCKET e $ENDPOINT saem do mesmo `railway bucket credentials`.
aws s3 cp "s3://${BUCKET}/db-backups/production/manifest.jsonl" . --endpoint-url "$ENDPOINT"
STAMP=$(tail -n 1 manifest.jsonl | jq -r .stamp)
grep -F "\"stamp\":\"${STAMP}\"" manifest.jsonl | jq -r .object | while read -r key; do
  aws s3 cp "s3://${BUCKET}/${key}"        . --endpoint-url "$ENDPOINT"
  aws s3 cp "s3://${BUCKET}/${key}.sha256" . --endpoint-url "$ENDPOINT"
done
```

São **duas** linhas: se vierem menos, o ciclo está pela metade e o certo é o anterior. Depois:

```bash
for f in backup-${STAMP}-*.dump.enc; do
  shasum -a 256 -c "${f}.sha256"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$f" -out "${f%.enc}"
  pg_restore --list "${f%.enc}" | tail -5
done
```

Se o `shasum` não bate, **pare** e use o backup anterior. Restaurar um dump corrompido por cima do
banco vivo troca um problema por um pior.

### R2. Ensaiar num Postgres descartável primeiro

```bash
docker run --rm -d -e POSTGRES_PASSWORD=x -p 127.0.0.1:55433:5432 --name restore-test postgres:18
until docker exec restore-test pg_isready -q; do sleep 1; done

for name in keycloak app; do   # identidade antes de aplicação, igual ao restore de verdade
  psql "postgresql://postgres:x@localhost:55433/postgres" -c "create database restore_${name}"
  pg_restore --dbname "postgresql://postgres:x@localhost:55433/restore_${name}" \
    --no-owner "backup-${STAMP}-${name}.dump"
done

psql "postgresql://postgres:x@localhost:55433/restore_app" -c \
  "select count(*) from companies; select count(*) from nfe_documents;
   select count(*) from cte_fiscal_documents; select count(*) from stored_objects;
   select count(*) from drizzle.__drizzle_migrations;"
```

O `127.0.0.1:` no `-p` não é detalhe: `-p 55433:5432` publica em `0.0.0.0` e põe um Postgres com
senha `x` — e uma cópia de production dentro — na rede em que o laptop estiver. A porta é 55433, e
não 5433, porque 5433 costuma já estar ocupada por outro projeto; se a sua estiver livre, tanto faz,
desde que o bind seja em loopback.

`stored_objects` é a checagem que mais importa: é o livro-razão que liga cada XML a um `bucket` e
uma `key`. Se ele voltar com linha que o bucket não tem, banco e storage estão fora de sincronia,
e o restore ainda não terminou.

Confira `tableCount` e `lastMigration` de cada banco contra a linha dele no manifesto — é isso que
separa "o arquivo abriu" de "o arquivo é o banco". Só depois disso se toca no ambiente real.

> Medido na staging em 08/08/2026: do primeiro `aws s3 cp` à conferência fechada, **14 segundos**
> para os dois bancos (dump da aplicação de 790 KiB). O número escala com o tamanho do dump, mas o
> roteiro não muda — o que ele diz é que o RTO desta parte é ruído perto do tempo de decidir
> restaurar.

### R3. Restaurar de verdade

```bash
pg_restore --dbname "$PGURL_KEYCLOAK" --no-owner --clean --if-exists "backup-${STAMP}-keycloak.dump"
pg_restore --dbname "$PGURL_APP"      --no-owner --clean --if-exists "backup-${STAMP}-app.dump"
```

`--clean --if-exists` sobrescreve. Num banco que ainda tem dado bom, isso apaga o dado bom —
confirme que o alvo é o certo antes de apertar o enter.

O que separa a R3 da R2 não é o alvo, é o `--clean`: derrubar objeto por objeto num banco já
povoado é onde o restore quebra, e no contêiner da R2 ele nunca é exercitado, porque lá o banco
nasce vazio. Rode o mesmo `pg_restore --clean --if-exists` uma segunda vez sobre os bancos que a
R2 acabou de povoar; se as contagens de tabela se mantiverem, o comando da R3 está provado antes
de tocar em production.

### R4. Voltar as chaves e subir

1. Repor `ENCRYPTION_KEYRING_JSON` e `IDEMPOTENCY_HMAC_KEY` nos serviços.
2. `railway redeploy --service api --environment production` e conferir o `assert-migrations`.
3. Worker e cron depois da API.
4. `GET /health/ready` verde.
5. Abrir um CT-e autorizado antigo e conferir que o XML abre — é o que prova que banco e bucket
   voltaram consistentes entre si.

## Se a keyring foi perdida

Não há recuperação: ADR-0004 é explícito — remover uma chave ainda referenciada torna o envelope
indecifrável. O caminho é reconstruir, não decifrar.

1. Gerar keyring nova (`production-v2`) e repor nos serviços.
2. Recadastrar o certificado A1 de **cada** empresa pela tela de configurações.
3. O que já foi emitido continua válido: o XML autorizado está no bucket e não depende da keyring.
   O que para é emitir novo até o certificado voltar.
4. Registrar o incidente com data em `docs/SECURITY.md` — que ainda não existe neste repositório e
   precisa ser criado na primeira vez que for usado. Achado de segurança não some no histórico do
   chat.

## Checklist de fechamento

- [ ] Dump dos **dois** bancos, cifrado, com `.sha256` conferido.
- [ ] Cópia em dois lugares, um deles **fora do Railway** — bucket de ops não conta como o segundo.
- [ ] Bucket fiscal espelhado.
- [ ] Keyring e HMAC conferidos no gerenciador de senhas.
- [ ] TCP proxy **removido**, se o Caminho B foi usado.
- [ ] Nenhum dump em claro sobrando no disco local.
- [ ] Nenhum segredo no histórico do terminal — `history -c` se algum foi digitado inline.
- [ ] Data, motivo e quem executou registrados no canal de operação.
