# Zona `fernandes-transportadora.com.br`

Estado da zona desta instalação. A distribuição é **um deploy por transportadora** (ADR-0021), então
este documento vale para **este** cliente: instalação nova tem zona própria, e o que se reaproveita
é o procedimento, nunca os valores.

A zona responde pela **Cloudflare** (`cartman`/`kinsley.ns.cloudflare.com`) e só muda por lá. O
`scripts/railway-domains.py` cria e confere os domínios no Railway e imprime os registros que
faltam — ele não escreve DNS.

> Medido com `dig` e `whois` em **01/10/2026**, e é esta medição que o documento descreve. Até esta
> data o arquivo ainda descrevia a migração para a Cloudflare como pendente, com `staging` e o
> `_railway-verify.staging` marcados "falta criar" — os dois já existiam. Doc de DNS que descreve o
> desejado e não o real engana na hora errada: é consultado durante incidente.

## A migração para a Cloudflare foi concluída

Trocada no registro.br em **26/08/2026**, `status: published`. O apex serve a landing de production
(`https://fernandes-transportadora.com.br/` responde 200, `<title>TransportAdA</title>`), e `www`
também.

O motivo da troca continua valendo e explica a forma da zona: **o Railway entrega domínio próprio
por CNAME e não publica IP fixo**, e **CNAME na raiz é proibido pelo RFC 1034** — a raiz obriga a
existir `SOA` e `NS`, e um CNAME não coexiste com outro registro no mesmo nome. Não é limitação de
painel; é do protocolo. Por isso a zona precisa de um provedor com **CNAME flattening**
(ALIAS/ANAME), que é o que a Cloudflare faz: no painel o apex é CNAME, e na resposta sai `A`
(`69.46.46.44` na medição).

> ⚠️ Na Cloudflare, **todo** registro fica **DNS only** (nuvem cinza). Proxy ligado põe um segundo
> CDN na frente do Railway e atravessa a validação ACME, que é o que emite o certificado do próprio
> Railway.

## O e-mail saiu da KingHost junto, e isso não estava no plano

O plano escrito aqui dizia que o e-mail continuava na KingHost e que `MX mx-vip-01/02.kinghost.net`
e `SPF include:_spf.kinghost.net -all` seriam copiados como estavam. **Não foi o que aconteceu.** A
zona de hoje entrega o e-mail à **Zoho**:

```
@   MX   10 mx.zoho.com. · 20 mx2.zoho.com. · 50 mx3.zoho.com.
@   TXT  "v=spf1 include:one.zoho.com -all"
```

E dez registros que o inventário marcava para copiar **não existem mais na zona**: `ftp`, `mssql`,
`mysql`, `mail`, `smtp`, `imap`, `pop`, `webmail`, `autoconfig`, `autodiscover`. Sobreviveram
`firebird` (`177.12.170.20`) e `pgsql` (`177.12.172.169`), os dois bancos da KingHost.

Some bem com a mudança para a Zoho — os seis de e-mail (`mail`, `smtp`, `imap`, `pop`, `webmail`,
`autoconfig`/`autodiscover`) apontavam para a infraestrutura de correio que deixou de ser usada. Mas
isso é inferência: **quem executou a migração não registrou a decisão**, e `ftp`, `mssql` e `mysql`
não têm relação com e-mail nenhum. Ver "Em aberto".

## Registros

`api`, `app` e `auth` são production; os `*.staging` são o ambiente de teste, e `staging` sozinho é
a landing — ela não leva rótulo de serviço, porque em production ela é o apex e o `www`. Os alvos
`*.up.railway.app` mudam se o domínio for recriado no Railway — a fonte da verdade é
`./scripts/railway-domains.py <ambiente>`.

Serviço interno não recebe domínio: `worker`, `cron`, `rabbitmq` e os bancos falam só por
`*.railway.internal`. Um domínio anônimo no `worker` de staging já entregou a topologia da infra
pelo `/health/ready` e foi removido.

```zone
$TTL 3600

; --- production ---
@                               CNAME  <alvo do Railway>        ; achatado para A na resposta
www                             CNAME  w5yu39ed.up.railway.app.
api                             CNAME  mrg272l0.up.railway.app.
app                             CNAME  8pcruu4z.up.railway.app.
auth                            CNAME  y5xkh5at.up.railway.app.

; --- staging ---
staging                         CNAME  z7ue7ike.up.railway.app.
api.staging                     CNAME  sacpzi6e.up.railway.app.
app.staging                     CNAME  8sipokkb.up.railway.app.
auth.staging                    CNAME  1q9dl5tb.up.railway.app.

; --- e-mail (Zoho) ---
@                               MX     10 mx.zoho.com.
@                               MX     20 mx2.zoho.com.
@                               MX     50 mx3.zoho.com.
@                               TXT    "v=spf1 include:one.zoho.com -all"
_dmarc                          TXT    "v=DMARC1; p=none;"

; --- bancos herdados da KingHost ---
firebird                        A      177.12.170.20
pgsql                           A      177.12.172.169

; --- posse dos dominios no Railway (os nove conferidos em 01/10/2026) ---
_railway-verify                 TXT    "railway-verify=eb7f2f944ee9009a6a488f71ee482c72742bbaf5696072f491fc87f30cd325d2"
_railway-verify.www             TXT    "railway-verify=ce4e44874c50d98f8f295174ab420c5b8c956c45663499de157745686b330aae"
_railway-verify.api             TXT    "railway-verify=2aa1660c227106e860bdb2d197d0622e034fdd81264f67c5f2587c3ab0a17adf"
_railway-verify.app             TXT    "railway-verify=d4d982c805b1795df9f26e7dc33353b76cdca6cd0270bf40522260ded6b4a62d"
_railway-verify.auth            TXT    "railway-verify=59e6a552b8d5a1031017dcbf406cac5b862c1615a773e38f21dfc4326ae05cfd"
_railway-verify.staging         TXT    "railway-verify=b2a7da44363793d87655c63ce54243a772ad212a385b6384c6462b4cf849962f"
_railway-verify.api.staging     TXT    "railway-verify=7ddf6a71b4b31287cece616ada4eb130b841f63345ce9ef3dbdf9c5e51d54a7e"
_railway-verify.app.staging     TXT    "railway-verify=906e1212967814d2db0df76c7cf61dd1947b1429ea6e82f30b1fc11264223d95"
_railway-verify.auth.staging    TXT    "railway-verify=8cbc55468cf484b53ee1e60833ddddcd4c3c96c8a937056eb3baadd0eecc786f"
```

O apex aparece como `<alvo do Railway>` de propósito: a Cloudflare achata o CNAME antes de
responder, então o alvo não sai no `dig` — ele é visível no painel da Cloudflare e em
`./scripts/railway-domains.py production`. Inventar um valor aqui seria pior que a lacuna.

Sem o `TXT` de posse o certificado fica preso em `validating_ownership` para sempre: o CNAME
apontando certo prova **roteamento**, não propriedade do nome.

## O domínio vence em 06/11/2026, e quem cobra mudou

`whois` em 01/10/2026: titular `Fernandes Transportes` (`61.156.864/0001-91`), contatos
`FETRA115`, `expires: 20261106`, `status: ACTIVE`.

O provedor `KINGHOST (107)` **não aparece mais** no registro.br — era ele que travava os campos de
DNS do painel, e desvinculá-lo foi o que liberou a troca de nameserver. A consequência fica: **com
provedor, quem renovava era a KingHost; sem ele, a cobrança vem direta do registro.br** para o
contato `FETRA115`. São cinco semanas até o vencimento e **ninguém confirmou neste repositório que
alguém vai pagar**. Domínio vencido derruba o apex, a API, o Keycloak e o e-mail de uma vez.

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

## Acrescentar um domínio a um serviço

1. `./scripts/railway-domains.py <ambiente>` — cria os domínios, imprime CNAME + TXT.
2. Criar os registros na Cloudflare, **DNS only**. O Host vai relativo (`api.staging`, não o FQDN).
3. Rodar o script de novo até `dns` sair de `update` e `certificado` de `ownership` para `valid`.
4. `./scripts/keycloak-client-origins.py <ambiente> add-origin https://app.<prefixo>` — **antes**
   das variáveis, e aditivo: as duas origens passam a valer.
5. `./scripts/railway-domain-variables.py <ambiente> --apply` — dispara build dos três serviços.
6. Validar: `/health/ready` com `identity: up`, `issuer` do discovery, preflight refletindo a
   origem nova e recusando a antiga, e o bundle servido contendo as URLs novas.
7. Remover a origem antiga do client do Keycloak, quando não houver mais sessão nela.

`FRONTEND_ORIGIN` aceita **uma origem só** (o regex em
`apps/api-transportada/src/config/environment.schema.ts` rejeita lista), então o passo 5 é uma
virada seca: no instante em que ele roda, o frontend no endereço antigo para de falar com a API. É
por isso que o passo 4 vem antes.

## Estado

| Ambiente   | Domínios | Certificado | Variáveis                       | Validado      |
| ---------- | -------- | ----------- | ------------------------------- | ------------- |
| staging    | ✅       | ✅ `valid`  | ✅                              | ✅ 12/08/2026 |
| production | ✅       | ✅ `valid`  | ⏳ ainda nos `*.up.railway.app` | —             |

Os nove hosts respondem e os nove `_railway-verify` estão publicados (01/10/2026).

Pendente nos dois: as seis variáveis do Gatus (`GATUS_{STAGING,PRODUCTION}_{API,KEYCLOAK,FRONTEND}_URL`),
que vivem no serviço `gatus` do projeto **`transportada-ops`**, não no `transportada`.

A zona **não tem `CAA`**. Ganhou `DMARC`, mas em `p=none;` — que só observa, não rejeita nada; o
domínio segue utilizável para spoofing até a política endurecer.

Um efeito colateral a vigiar: `.github/scripts/railway-deploy.sh` resolve a URL de
`assert-migrations` por `domains[0]`, e agora há dois domínios por serviço — qual dos dois ele pega
virou não-determinístico. Os dois respondem com certificado válido, então o passo passa de qualquer
forma; se um dia só um deles valer, é aqui que quebra.

## Em aberto

Perguntas que a medição levanta e que **não têm resposta neste repositório** — quem souber, responde
aqui em vez de deixar para a próxima leitura:

- **Quem renova o domínio em 06/11/2026?** Sem o provedor `KINGHOST (107)`, a cobrança é direta do
  registro.br para `FETRA115`.
- **`ftp`, `mssql` e `mysql` foram removidos de propósito?** Os três sumiram da zona junto com os de
  e-mail, mas não têm relação com correio, e `firebird`/`pgsql` — da mesma infraestrutura da
  KingHost — ficaram. Remover exige antes descobrir quem ainda conecta neles.
- **Por que o e-mail foi para a Zoho?** A decisão não está escrita em lugar nenhum, e ela muda quem
  responde por caixa postal em incidente.
- **`DMARC` sobe de `p=none`?** Hoje a política não rejeita nada.

## Histórico: o inventário da zona da KingHost (26/08/2026)

Mantido porque é a única cópia do que existia antes da migração, e porque a lista dos removidos só
faz sentido contra ele. Foi copiado do painel da KingHost, não do `dig`: `firebird`, `pgsql`,
`mssql`, `mysql` e `autoconfig` não aparecem em varredura, só respondem a quem já sabe o nome.

| Host                         | Tipo   | Destino                                            | Hoje                                 |
| ---------------------------- | ------ | -------------------------------------------------- | ------------------------------------ |
| `@`                          | A      | `177.12.168.246`                                   | ❌ removido — o apex virou a landing |
| `@`                          | AAAA   | `2804:10:8036::168:246`                            | ❌ removido junto com o A            |
| `www`                        | A      | `177.12.168.246`                                   | 🔁 CNAME próprio no Railway          |
| `ftp`                        | A      | `177.12.168.246`                                   | ❌ não existe mais                   |
| `firebird`                   | A      | `177.12.170.20`                                    | ✅ igual — banco na KingHost         |
| `pgsql`                      | A      | `177.12.172.169`                                   | ✅ igual — banco na KingHost         |
| `mssql`                      | CNAME  | `mssql10-farm22.kinghost.net`                      | ❌ não existe mais                   |
| `mysql`                      | CNAME  | `mysql30-farm36.kinghost.net`                      | ❌ não existe mais                   |
| `@`                          | MX (5) | `mx-vip-01.kinghost.net`, `mx-vip-02.kinghost.net` | 🔁 Zoho                              |
| `@`                          | TXT    | `v=spf1 include:_spf.kinghost.net -all`            | 🔁 `include:one.zoho.com`            |
| `mail`, `smtp`               | CNAME  | `smtp-vip.kinghost.net`                            | ❌ não existem mais                  |
| `imap`, `pop`                | CNAME  | `imap-vip.kinghost.net`                            | ❌ não existem mais                  |
| `webmail`                    | CNAME  | `webmail-vip.kinghost.net`                         | ❌ não existe mais                   |
| `autoconfig`, `autodiscover` | CNAME  | `autoconfig.kinghost.net`                          | ❌ não existem mais                  |

`docs/ops/cloudflare-import.zone` é o arquivo que foi importado na Cloudflare: 32 registros, réplica
da KingHost mais os dois da landing de staging. Ele descreve o **momento da importação**, não a zona
de hoje — o apex ainda no institucional, o e-mail ainda na KingHost. Serve de registro histórico e
de molde para a próxima instalação; não serve para conferir a zona atual.
