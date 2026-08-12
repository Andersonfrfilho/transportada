# Zona `fernandes-transportadora.com.br`

Estado desejado da zona desta instalação. A distribuição é **um deploy por transportadora**
(ADR-0021), então este documento vale para **este** cliente: instalação nova tem zona própria, e o
que se reaproveita é o procedimento, nunca os valores.

A zona responde pela **KingHost** (`dns1`/`dns2.kinghost.com.br`) e só muda por lá. O
`scripts/railway-domains.py` cria e confere os domínios no Railway e imprime os registros que faltam
— ele não escreve DNS.

## O que não se toca

O apex já serve o site institucional (`A 177.12.168.246`, KingHost) e o e-mail do domínio já
funciona na KingHost (`MX mx-vip-01/02.kinghost.net`, `SPF include:_spf.kinghost.net -all`). O
produto entra **só em subdomínios novos**: nenhum registro existente é alterado, e não há nada a
configurar do nosso lado para o e-mail continuar funcionando.

O apex também não serviria: o Railway entrega domínio próprio por CNAME e não publica IP fixo, e
**CNAME na raiz é proibido pelo RFC 1034** — a raiz obriga a existir `SOA` e `NS`, e um CNAME não
coexiste com outro registro no mesmo nome. Não é limitação do painel da KingHost nem do Railway; é
do protocolo. Fechar o apex exigiria um provedor com **CNAME flattening** (Cloudflare, entre
outros), e como o apex é do site institucional, isso não está em pauta.

> Se um dia a zona for para a Cloudflare: todos os registros ficam **DNS only** (nuvem cinza).
> Proxy ligado põe um segundo CDN na frente do Railway e atravessa a validação ACME, que é o que
> emite o certificado do próprio Railway.

## Registros

`api`, `app` e `auth` são production; os `*.staging` são o ambiente de teste. Os alvos
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

; --- posse dos dominios no Railway ---
_railway-verify.api.staging     TXT    "railway-verify=7ddf6a71b4b31287cece616ada4eb130b841f63345ce9ef3dbdf9c5e51d54a7e"
_railway-verify.app.staging     TXT    "railway-verify=906e1212967814d2db0df76c7cf61dd1947b1429ea6e82f30b1fc11264223d95"
_railway-verify.auth.staging    TXT    "railway-verify=8cbc55468cf484b53ee1e60833ddddcd4c3c96c8a937056eb3baadd0eecc786f"
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
