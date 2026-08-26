# Zona `fernandes-transportadora.com.br`

Estado desejado da zona desta instalação. A distribuição é **um deploy por transportadora**
(ADR-0021), então este documento vale para **este** cliente: instalação nova tem zona própria, e o
que se reaproveita é o procedimento, nunca os valores.

A zona responde pela **KingHost** (`dns1`/`dns2.kinghost.com.br`) e só muda por lá. O
`scripts/railway-domains.py` cria e confere os domínios no Railway e imprime os registros que faltam
— ele não escreve DNS.

## O apex é da landing, e por isso a zona muda de provedor

A landing **é o domínio**: em production ela responde no apex
`fernandes-transportadora.com.br`, sem rótulo de serviço. Duas coisas decorrem disso.

**A zona sai da KingHost.** O Railway entrega domínio próprio por CNAME e não publica IP fixo, e
**CNAME na raiz é proibido pelo RFC 1034** — a raiz obriga a existir `SOA` e `NS`, e um CNAME não
coexiste com outro registro no mesmo nome. Não é limitação do painel da KingHost nem do Railway; é
do protocolo. Apontar o apex para o Railway exige um provedor com **CNAME flattening** (ou
ALIAS/ANAME): a decisão é **Cloudflare**.

**O site institucional do apex sai do ar.** Hoje o apex é `A 177.12.168.246` (KingHost). Quem passa
a responder ali é a landing.

O e-mail continua na KingHost e não muda de lado nenhum — o que muda é quem responde pela zona.
`MX mx-vip-01/02.kinghost.net` e `SPF include:_spf.kinghost.net -all` são copiados como estão.

> ⚠️ Na Cloudflare, **todo** registro fica **DNS only** (nuvem cinza). Proxy ligado põe um segundo
> CDN na frente do Railway e atravessa a validação ACME, que é o que emite o certificado do próprio
> Railway.

### Inventário da zona atual (painel da KingHost, 26/08/2026)

Lista completa e **autoritativa** — copiada da tabela de DNS do painel, não do `dig`. A diferença
importa: `firebird`, `pgsql`, `mssql`, `mysql` e `autoconfig` não aparecem em varredura, só
respondem a quem já sabe o nome. São os que somem numa migração sem ninguém notar, até um sistema
antigo parar de conectar.

| Host                         | Tipo   | Destino                                            | Depois da migração                                      |
| ---------------------------- | ------ | -------------------------------------------------- | ------------------------------------------------------- |
| `@`                          | A      | `177.12.168.246`                                   | ❌ removido — o apex passa a ser a landing              |
| `@`                          | AAAA   | `2804:10:8036::168:246`                            | ❌ removido junto com o A                               |
| `www`                        | A      | `177.12.168.246`                                   | 🔁 vira CNAME para o apex                               |
| `ftp`                        | A      | `177.12.168.246`                                   | ✅ igual                                                |
| `firebird`                   | A      | `177.12.170.20`                                    | ✅ igual — banco na KingHost                            |
| `pgsql`                      | A      | `177.12.172.169`                                   | ✅ igual — banco na KingHost                            |
| `mssql`                      | CNAME  | `mssql10-farm22.kinghost.net`                      | ✅ igual — banco na KingHost                            |
| `mysql`                      | CNAME  | `mysql30-farm36.kinghost.net`                      | ✅ igual — banco na KingHost                            |
| `@`                          | MX (5) | `mx-vip-01.kinghost.net`, `mx-vip-02.kinghost.net` | ✅ iguais                                               |
| `@`                          | TXT    | `v=spf1 include:_spf.kinghost.net -all`            | ✅ igual                                                |
| `mail`, `smtp`               | CNAME  | `smtp-vip.kinghost.net`                            | ✅ iguais                                               |
| `imap`, `pop`                | CNAME  | `imap-vip.kinghost.net`                            | ✅ iguais                                               |
| `webmail`                    | CNAME  | `webmail-vip.kinghost.net`                         | ✅ igual — **está duplicado na zona**, criar uma vez só |
| `autoconfig`, `autodiscover` | CNAME  | `autoconfig.kinghost.net`                          | ✅ iguais                                               |
| `api`                        | CNAME  | `mrg272l0.up.railway.app`                          | ✅ igual                                                |
| `app`                        | CNAME  | `8pcruu4z.up.railway.app`                          | ✅ igual                                                |
| `auth`                       | CNAME  | `y5xkh5at.up.railway.app`                          | ✅ igual                                                |
| `api.staging`                | CNAME  | `sacpzi6e.up.railway.app`                          | ✅ igual                                                |
| `app.staging`                | CNAME  | `8sipokkb.up.railway.app`                          | ✅ igual                                                |
| `auth.staging`               | CNAME  | `1q9dl5tb.up.railway.app`                          | ✅ igual                                                |
| `_railway-verify.*` (6)      | TXT    | ver o bloco de registros abaixo                    | ✅ iguais                                               |
| `staging`                    | CNAME  | `z7ue7ike.up.railway.app`                          | ➕ **falta criar** — a landing                          |
| `_railway-verify.staging`    | TXT    | `railway-verify=b2a7da44…962f`                     | ➕ **falta criar**                                      |

Os quatro registros de banco (`firebird`, `pgsql`, `mssql`, `mysql`) apontam para infraestrutura da
KingHost e **não têm relação com este produto** — vêm de sistemas anteriores. Copiar é o padrão;
remover exige antes descobrir quem ainda conecta neles, e a resposta não está neste repositório.

A zona **não tem** `DMARC` nem `CAA`. Nenhum é pré-requisito da migração, mas a ausência de DMARC
deixa o domínio livre para spoofing — item para depois.

### Quem administra o domínio bloqueia a troca de nameserver

O domínio tem **Provedor de Serviços `KINGHOST (107)`** no registro.br, e enquanto ele existir os
campos de DNS do painel são da KingHost: **não dá para trocar os nameservers sem desvincular o
provedor antes**. Desvincular muda quem cobra a renovação — com provedor, quem renova é a KingHost;
sem ele, a cobrança vem direta do registro.br para o contato `FETRA115`. O domínio expira em
**06/11/2026**, então essa troca precisa ser confirmada com a KingHost antes, não depois.

Estado atual no registro.br, para poder reverter: titular `Fernandes Transportes`
(`61.156.864/0001-91`), contatos administrativo/técnico/cobrança todos `FETRA115`, nameservers
`dns1`…`dns6.kinghost.com.br`, provedor `KINGHOST (107)`.

### O arquivo de importação

`docs/ops/cloudflare-import.zone` é a zona pronta para _DNS → Records → Import and Export →
Import_ na Cloudflare: 32 registros, réplica exata da KingHost mais os dois da landing de staging.
Importar arquivo evita o erro que a digitação de trinta linhas produz e que ninguém revisa.

Duas escolhas dentro dele que não são acidente:

- **O apex continua no site institucional.** No instante da troca de nameserver a zona nova precisa
  se comportar igual à antiga; trocar o apex para a landing é passo separado e posterior, com
  rollback de um clique.
- **`webmail` entra uma vez.** A zona da KingHost tem o registro duplicado.

`SOA` e `NS` ficam de fora — a Cloudflare cria os dela e recusa os de fora.

### Ordem de execução

1. Confirmar com a KingHost quem passa a renovar o domínio depois de desvincular o provedor.
2. Criar a zona na Cloudflare e **importar `docs/ops/cloudflare-import.zone`**. Conferir os 32
   registros contra o inventário — a varredura automática da Cloudflare não enxerga os quatro de
   banco, e registro esquecido aqui é e-mail parado depois. Tudo DNS only (nuvem cinza).
3. Conferir a zona nova respondendo pelos nameservers da Cloudflare **antes** de apontar o
   registrador: `dig @<ns-da-cloudflare> fernandes-transportadora.com.br MX`.
4. No registro.br, desvincular o provedor `KINGHOST (107)` — é o que libera os campos de DNS.
5. Trocar os seis `dns*.kinghost.com.br` pelos **dois** da Cloudflare e esperar a propagação.
6. Baixar o TTL do apex e do `www` para 300 antes de mexer neles: é o que faz o rollback custar
   cinco minutos em vez de uma hora.
7. Só então trocar o apex: remover o `A`/`AAAA` e criar o CNAME para o alvo do Railway em
   production, que a Cloudflare achata na resposta. O site institucional sai do ar neste passo.
8. `www` como CNAME para o apex, para quem digita com o prefixo.

Enquanto os passos 1–3 não acontecerem, o apex de production continua servindo o institucional e a
landing de production não tem endereço próprio.

## Registros

`api`, `app` e `auth` são production; os `*.staging` são o ambiente de teste, e `staging` sozinho
é a landing — ela não leva rótulo de serviço, porque em production ela é o apex. Os alvos
`*.up.railway.app` mudam se o domínio for recriado no Railway — a fonte da verdade é
`./scripts/railway-domains.py <ambiente>`.

Serviço interno não recebe domínio: `worker`, `cron`, `rabbitmq` e os bancos falam só por
`*.railway.internal`. Um domínio anônimo no `worker` de staging já entregou a topologia da infra
pelo `/health/ready` e foi removido.

```zone
$TTL 3600

; --- production ---
api                             CNAME  mrg272l0.up.railway.app.
app                             CNAME  8pcruu4z.up.railway.app.
auth                            CNAME  y5xkh5at.up.railway.app.

_railway-verify.api             TXT    "railway-verify=2aa1660c227106e860bdb2d197d0622e034fdd81264f67c5f2587c3ab0a17adf"
_railway-verify.app             TXT    "railway-verify=d4d982c805b1795df9f26e7dc33353b76cdca6cd0270bf40522260ded6b4a62d"
_railway-verify.auth            TXT    "railway-verify=59e6a552b8d5a1031017dcbf406cac5b862c1615a773e38f21dfc4326ae05cfd"

; --- staging ---
api.staging                     CNAME  sacpzi6e.up.railway.app.
app.staging                     CNAME  8sipokkb.up.railway.app.
auth.staging                    CNAME  1q9dl5tb.up.railway.app.
staging                         CNAME  z7ue7ike.up.railway.app.

; --- posse dos dominios no Railway ---
_railway-verify.api.staging     TXT    "railway-verify=7ddf6a71b4b31287cece616ada4eb130b841f63345ce9ef3dbdf9c5e51d54a7e"
_railway-verify.app.staging     TXT    "railway-verify=906e1212967814d2db0df76c7cf61dd1947b1429ea6e82f30b1fc11264223d95"
_railway-verify.auth.staging    TXT    "railway-verify=8cbc55468cf484b53ee1e60833ddddcd4c3c96c8a937056eb3baadd0eecc786f"
_railway-verify.staging         TXT    "railway-verify=b2a7da44363793d87655c63ce54243a772ad212a385b6384c6462b4cf849962f"
```

No painel da KingHost o Host vai **relativo** (`api.staging`, não o FQDN), o CNAME leva **ponto
final** e o TXT vai **sem aspas** — o painel as adiciona, e aspas digitadas viram parte do valor,
o que reprova a verificação.

Sem o `TXT` de posse o certificado fica preso em `validating_ownership` para sempre: o CNAME
apontando certo prova **roteamento**, não propriedade do nome.

## O que muda junto com o domínio

Trocar o endereço público quebra quatro coisas de uma vez, e as quatro mudam na mesma passada
(detalhe em `docs/spec/railway.md`):

| Onde                       | O que                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `api`                      | `FRONTEND_ORIGIN` (CORS), `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URI`                       |
| `transportada-frontend`    | `VITE_API_URL`, `VITE_APP_URL`, `VITE_KEYCLOAK_URL`                                    |
| `keycloak`                 | `KC_HOSTNAME`, `KEYCLOAK_FRONTEND_ORIGIN`                                              |
| realm `transportada`       | `redirectUris`, `webOrigins`, `post.logout.redirect.uris` do client `transportada-spa` |
| `deploy/gatus/config.yaml` | `GATUS_STAGING_FRONTEND_URL`, `GATUS_PRODUCTION_FRONTEND_URL`                          |

Dois cuidados que não são óbvios:

- **`VITE_*` é inlinado no bundle** (`ARG` no `apps/frontend-transportada/Dockerfile`): mudar
  domínio exige **rebuild** do frontend, não restart.
- **O `--import-realm` ignora realm já existente**, então o client vivo só muda pela admin API do
  Keycloak — editar `deploy/keycloak/realm.json` ou atualizar `KEYCLOAK_FRONTEND_ORIGIN` sozinho
  não tem efeito no que já está de pé.

## Ordem de execução

1. `./scripts/railway-domains.py <ambiente>` — cria os domínios, imprime CNAME + TXT.
2. Criar os registros na KingHost.
3. Rodar o script de novo até `dns` sair de `update` e `certificado` de `ownership` para `valid`.
4. `./scripts/keycloak-client-origins.py <ambiente> add-origin https://app.<prefixo>` — **antes**
   das variáveis, e aditivo: as duas origens passam a valer.
5. `./scripts/railway-domain-variables.py <ambiente> --apply` — dispara build dos três serviços.
6. Validar: `/health/ready` com `identity: up`, `issuer` do discovery, preflight refletindo a
   origem nova e recusando a antiga, e o bundle servido contendo as URLs novas.
7. Remover a origem antiga do client do Keycloak, quando não houver mais sessão nela.

`FRONTEND_ORIGIN` aceita **uma origem só** (o regex em `apps/api-transportada/src/config/environment.schema.ts`
rejeita lista), então o passo 5 é uma virada seca: no instante em que ele roda, o frontend no
endereço antigo para de falar com a API. É por isso que o passo 4 vem antes.

## Estado

| Ambiente   | Domínios | Certificado | Variáveis                       | Validado      |
| ---------- | -------- | ----------- | ------------------------------- | ------------- |
| staging    | ✅       | ✅ `valid`  | ✅                              | ✅ 12/08/2026 |
| production | ✅       | ✅ `valid`  | ⏳ ainda nos `*.up.railway.app` | —             |

Pendente nos dois: as seis variáveis do Gatus (`GATUS_{STAGING,PRODUCTION}_{API,KEYCLOAK,FRONTEND}_URL`),
que vivem no serviço `gatus` do projeto **`transportada-ops`**, não no `transportada`.

Um efeito colateral a vigiar: `.github/scripts/railway-deploy.sh` resolve a URL de
`assert-migrations` por `domains[0]`, e agora há dois domínios por serviço — qual dos dois ele pega
virou não-determinístico. Os dois respondem com certificado válido, então o passo passa de
qualquer forma; se um dia só um deles valer, é aqui que quebra.
