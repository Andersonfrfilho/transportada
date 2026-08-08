# Backup de emergência

Procedimento manual, para quando não dá para esperar a janela automática. Vale tanto antes de a
feature 029 entregar o serviço `backup` quanto depois, quando ele existir e estiver quebrado.

> ⚠️ Estado em 07/08/2026: **não existe backup automático de nenhum ambiente**. Enquanto a
> feature 029 não fechar a fase B, este documento é o único backup que o produto tem.

## Quando usar

- Antes de aplicar migration com `DROP`, mudança de tipo ou remoção de constraint.
- Antes de um deploy que promove muitos commits de uma vez.
- Ao suspeitar de corrupção, perda ou escrita indevida.
- Quando o ciclo automático falhou e a próxima janela está longe demais.
- Antes de qualquer mexida manual em dado de production por `psql`.

## Antes de começar

Tenha à mão, e confira que **tem** antes de precisar:

| Item                        | Onde está                                                     |
| --------------------------- | -------------------------------------------------------------- |
| `railway` CLI autenticado   | `railway whoami`                                                |
| `pg_dump` **18**            | `psql --version` — o servidor é `postgres-ssl:18`; cliente antigo falha |
| `openssl`                   | qualquer versão recente                                         |
| `aws` CLI                   | para falar com os buckets do Railway                            |
| `BACKUP_ENCRYPTION_KEY`     | gerenciador de senhas — **sem ela o dump é lixo cifrado**       |
| `ENCRYPTION_KEYRING_JSON`   | gerenciador de senhas — sem ela o certificado A1 é irrecuperável |

Os dois bancos de production, para não confundir na hora errada:

| Serviço          | O que guarda                       |
| ---------------- | ---------------------------------- |
| `Postgres-Hqfu`  | banco da aplicação                 |
| `Postgres-FDoz`  | banco do Keycloak (identidade)     |

Em staging são `Postgres` e `Postgres-q0RQ`. **Os dois entram no backup.** Restaurar só o da
aplicação devolve o dado e deixa todo mundo sem conseguir entrar.

## Caminho A — com o serviço `backup` (depois da feature 029)

O ciclo é one-shot: redeployar dispara uma execução completa fora da janela.

```bash
railway redeploy --service backup --environment production
railway logs --service backup --environment production
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

```bash
export AWS_ACCESS_KEY_ID=$BACKUP_S3_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$BACKUP_S3_SECRET_ACCESS_KEY
aws s3 cp "app-${STAMP}.dump.enc" \
  "s3://transportada-backups/db-backups/manual/" --endpoint-url "$BACKUP_S3_ENDPOINT"
```

O bucket `transportada-backups` vive no projeto Railway `transportada-ops`, separado do ambiente
que ele protege. Repita para o `.sha256` e para o dump do Keycloak.

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

| Item                                        | Consequência de perder                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `ENCRYPTION_KEYRING_JSON`                   | Todo certificado A1 vira envelope indecifrável (ADR-0004)                |
| `IDEMPOTENCY_HMAC_KEY`                      | Chaves de idempotência antigas param de casar                            |
| XML fiscal no bucket                        | O banco referencia `bucket`/`key`; sem o objeto, o documento não existe  |
| Configuração do realm feita à mão           | `--import-realm` ignora realm existente e não reconstrói o que foi manual |
| Variáveis de ambiente do Railway            | Reconstituídas a partir de `docs/spec/railway.md` § Variáveis            |

Por isso o backup do banco sozinho **não** é o backup do produto. As duas linhas seguintes fazem
parte do mesmo procedimento.

### Espelhar o bucket fiscal à mão

```bash
aws s3 sync "s3://transportada-production" "s3://transportada-fiscal-mirror" \
  --endpoint-url "$BACKUP_S3_ENDPOINT"
```

Nunca com `--delete`: o XML autorizado é imutável (ADR-0006), então sumir na origem é anomalia, e
um espelho que replica remoção propaga o acidente.

### Copiar a keyring

Ela sai do Railway e vai para o gerenciador de senhas — nunca para o repositório, nunca para o
terminal compartilhado, nunca para um canal de chat. Segredo que apareceu em log é segredo
queimado (regra de segurança §4).

**Local da cópia de production:** _preencher na T017 da feature 029 — o local, jamais o valor._

## Restauração de emergência

Ordem, porque ela importa: identidade antes de aplicação. Restaurar o banco da aplicação primeiro
deixa a janela em que existe dado sem ninguém autorizado a vê-lo.

### R1. Decifrar e conferir

```bash
shasum -a 256 -c app-<stamp>.dump.enc.sha256
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass env:BACKUP_ENCRYPTION_KEY -in app-<stamp>.dump.enc -out app.dump
pg_restore --list app.dump | tail -5
```

Se o `shasum` não bate, **pare** e use o backup anterior. Restaurar um dump corrompido por cima do
banco vivo troca um problema por um pior.

### R2. Ensaiar num Postgres descartável primeiro

```bash
docker run --rm -d -e POSTGRES_PASSWORD=x -p 5433:5432 --name restore-test postgres:18
pg_restore --dbname "postgresql://postgres:x@localhost:5433/postgres" --no-owner app.dump
psql "postgresql://postgres:x@localhost:5433/postgres" -c \
  "select count(*) from companies; select count(*) from nfe_documents;
   select count(*) from cte_fiscal_documents; select count(*) from stored_objects;
   select count(*) from drizzle.__drizzle_migrations;"
```

`stored_objects` é a checagem que mais importa: é o livro-razão que liga cada XML a um `bucket` e
uma `key`. Se ele voltar com linha que o bucket não tem, banco e storage estão fora de sincronia,
e o restore ainda não terminou.

As contagens têm de bater com o manifesto do backup. Só depois disso se toca no ambiente real.

### R3. Restaurar de verdade

```bash
pg_restore --dbname "$PGURL_KEYCLOAK" --no-owner --clean --if-exists keycloak.dump
pg_restore --dbname "$PGURL_APP"      --no-owner --clean --if-exists app.dump
```

`--clean --if-exists` sobrescreve. Num banco que ainda tem dado bom, isso apaga o dado bom —
confirme que o alvo é o certo antes de apertar o enter.

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
