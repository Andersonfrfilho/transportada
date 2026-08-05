# Service account da Admin API

Runbook para o client `transportada-admin` — a credencial que a API usa para
criar usuários no Keycloak (ADR-0022). É um client confidencial com
`serviceAccountsEnabled`, autenticado por `client_credentials`: não existe
usuário nem senha nesse caminho.

Vale para `staging` e `production`. O segredo é por ambiente e nunca é
compartilhado entre eles.

## O que o realm versionado já traz

`deploy/keycloak/realm.json` e `realm/transportada-local-realm.json` declaram:

| Recurso                                      | Configuração                                                     |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Client `transportada-admin`                  | `publicClient: false`, `clientAuthenticatorType: client-secret`  |
| Fluxos                                       | todos desligados, exceto `serviceAccountsEnabled: true`          |
| `directAccessGrantsEnabled`                  | `false` — sem grant de senha, nem para o próprio client          |
| Segredo                                      | `${KEYCLOAK_ADMIN_CLIENT_SECRET}`, resolvido do ambiente no boot |
| Usuário `service-account-transportada-admin` | `clientRoles: { realm-management: [manage-users] }`, nada além   |

O contrato `test/keycloak-realm.contract.test.ts` falha se qualquer um desses
pontos mudar, e falha também se algum segredo literal aparecer no JSON — realm
versionado vai para o git, então segredo em claro ali é segredo queimado.

`manage-users` é o único papel concedido. Não inclua `realm-admin` nem
`manage-realm`: a API só cria e atualiza usuário.

## Por que ambiente já criado não recebe o client sozinho

O import do Keycloak roda com estratégia "ignora o que já existe", e isso vale
para o **realm inteiro**. Onde o realm `transportada` já foi criado, um deploy
novo não acrescenta o client — o bloco de import é pulado por completo. O
mesmo motivo descrito em [`keycloak-first-admin.md`](./keycloak-first-admin.md).

Há dois caminhos, e a escolha depende do ambiente ter dado real ou não.

### Caminho A — ambiente descartável (staging): apagar o realm

Mais simples e o que deixa o ambiente idêntico ao arquivo versionado.

1. Console do Keycloak → _Realm settings_ do realm `transportada` → _Action_ →
   _Delete_.
2. Defina `KEYCLOAK_ADMIN_CLIENT_SECRET` nas variáveis do serviço `keycloak`
   (veja "Gerar o segredo" abaixo).
3. Redeploy do serviço `keycloak`. O import roda do zero e cria o realm com o
   client já configurado.
4. Refaça o [primeiro administrador](./keycloak-first-admin.md) — apagar o realm
   apaga os usuários junto.

> ⚠️ Apagar o realm invalida todas as sessões e todos os usuários do Keycloak
> daquele ambiente. O banco da aplicação não é tocado, mas os vínculos de
> identidade externa (issuer + subject) passam a apontar para `sub` que não
> existem mais. Em `production` isso é indisponibilidade, não manutenção.

### Caminho B — ambiente com dado real (production): criar pelo console

1. Console → realm `transportada` → _Clients_ → _Create client_.
   - _Client ID_: `transportada-admin`
   - _Client authentication_: **On**
   - _Authorization_: Off
   - _Authentication flow_: desmarque tudo, marque apenas
     **Service accounts roles**
   - _Valid redirect URIs_ e _Web origins_: vazios
2. Aba _Credentials_ → _Regenerate_ → copie o segredo direto para as variáveis
   do serviço `api`. Não passe por terminal, log ou chat.
3. Aba _Service accounts roles_ → _Assign role_ → filtro **Filter by clients** →
   selecione `realm-management manage-users` → _Assign_.
4. Confira que nenhum outro papel ficou atribuído.

## Gerar o segredo

```bash
openssl rand -hex 32
```

Gere no seu terminal e cole direto no campo do dashboard. O valor entra em dois
lugares e precisa ser idêntico nos dois:

| Serviço    | Variável                       | Por quê                                     |
| ---------- | ------------------------------ | ------------------------------------------- |
| `keycloak` | `KEYCLOAK_ADMIN_CLIENT_SECRET` | resolve o placeholder do realm no import    |
| `api`      | `KEYCLOAK_ADMIN_CLIENT_SECRET` | autentica o `client_credentials` em runtime |

No caminho B o segredo nasce no console, então a variável do `keycloak` fica
sem uso naquele ambiente — só a do `api` importa.

Local: `make bootstrap` copia o `.env.example`, que traz o campo com um valor
placeholder. Troque por um valor gerado antes de `make dev` — `make config`
falha se a variável estiver vazia.

## Verificar

Com o ambiente no ar, a partir de um shell com as variáveis carregadas:

```bash
TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/token" \
  -d grant_type=client_credentials \
  -d "client_id=$KEYCLOAK_ADMIN_CLIENT_ID" \
  --data-urlencode "client_secret=$KEYCLOAK_ADMIN_CLIENT_SECRET" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')

# 200 = o service account enxerga a Admin API
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users?max=1"

# 400 = grant de senha continua desligado, como deve
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "$KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/token" \
  -d grant_type=password -d "client_id=$KEYCLOAK_ADMIN_CLIENT_ID" \
  --data-urlencode "client_secret=$KEYCLOAK_ADMIN_CLIENT_SECRET" \
  -d username=qualquer -d password=qualquer
```

O `$TOKEN` fica na memória do shell e não deve ser ecoado. Feche o shell ao
terminar.

## Checklist

- [ ] Client `transportada-admin` existe no realm do ambiente
- [ ] Apenas **Service accounts roles** marcado nos fluxos
- [ ] `manage-users` do `realm-management` atribuído, e só ele
- [ ] `KEYCLOAK_ADMIN_CLIENT_SECRET` definido no serviço `api`
- [ ] `client_credentials` devolve token e `GET /admin/.../users` responde 200
- [ ] Grant de senha responde 400
- [ ] Segredo não apareceu em terminal, log, chat ou commit

## Erros comuns

| Sintoma                                      | Causa provável                                                  |
| -------------------------------------------- | --------------------------------------------------------------- |
| `401 invalid_client`                         | segredo divergente entre `api` e Keycloak, ou client não existe |
| `401 unauthorized_client`                    | _Service accounts roles_ desmarcado no client                   |
| `403` no `GET /admin/.../users`              | `manage-users` não atribuído ao service account                 |
| Deploy novo e o client continua sem aparecer | realm já existia — o import foi pulado; siga o caminho A ou B   |
| `make config` falha logo no começo           | `KEYCLOAK_ADMIN_CLIENT_SECRET` vazio no `.env`                  |
