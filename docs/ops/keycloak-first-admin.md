# Primeiro administrador do ambiente (via console)

Runbook para deixar um ambiente publicado utilizável: criar o usuário no
Keycloak, apontar as variáveis de provisionamento e conferir que o vínculo
`company-admin` nasceu no banco.

Vale para `staging` e `production` — a mesma sequência, valores diferentes.
Nada aqui é reaproveitável entre ambientes: senha, UUID de empresa e `sub` são
por ambiente.

## Por que é manual

O realm `transportada` é importado no boot do Keycloak com estratégia "ignora o
que já existe", e isso vale para o **realm inteiro**, não recurso a recurso.
Onde o realm já foi criado, nenhum deploy novo do Keycloak acrescenta usuário —
o bloco de import é simplesmente pulado. Criar o usuário pelo console é o
caminho previsto até a fase C da feature 026 entregar o gateway do Keycloak
(T000c), quando a própria API passa a criar o usuário desabilitado e emitir o
código de ativação.

## Antes de começar

| Item                              | Onde                                                                       |
| --------------------------------- | -------------------------------------------------------------------------- |
| Console do Keycloak (staging)     | `https://keycloak-staging-d714.up.railway.app`                             |
| Console do Keycloak (production)  | domínio do serviço `keycloak` no ambiente `production`                     |
| Usuário/senha do admin **master** | Railway → serviço `keycloak` → _Variables_ → `KC_BOOTSTRAP_ADMIN_PASSWORD` |
| Variáveis de provisionamento      | Railway → serviço `api` → _Variables_                                      |
| Campo de config-as-code           | Railway → serviço `api` → _Settings_                                       |

> 🔒 A senha do admin master sai do dashboard e vai direto para o formulário de
> login. Não cole em terminal, log, chat ou commit — segredo que aparece nesses
> lugares é segredo queimado e precisa ser rotacionado.

Gere o UUID da empresa do ambiente antes de abrir o console (v4, minúsculo):

```bash
uuidgen | tr 'A-Z' 'a-z'
```

Esse valor é o `PROVISION_COMPANY_ID`. Anote — ele entra em dois lugares (no
atributo do usuário e na variável da API) e precisa ser idêntico nos dois.

## 1. Criar o usuário

Console → seletor de realm no topo esquerdo → **`transportada`** (não faça nada
no realm `master` além do login) → _Users_ → **Add user**.

| Campo             | Valor                                                    |
| ----------------- | -------------------------------------------------------- |
| Username          | `company-admin` (ou o nome real de quem vai administrar) |
| Email             | e-mail real de quem administra                           |
| Email verified    | **On**                                                   |
| First / Last name | dados reais                                              |
| Required actions  | vazio                                                    |

_Create_.

> O realm tem `loginWithEmailAllowed: false` — o login é pelo **username**.

## 2. Atributo `company_id`

Ainda no usuário → aba **Attributes** → _Add an attribute_:

| Key          | Value                           |
| ------------ | ------------------------------- |
| `company_id` | o UUID gerado no passo anterior |

_Save_. É o `unmanagedAttributePolicy: ENABLED` do realm que mantém esse
atributo vivo; sem ele o Keycloak descarta o valor silenciosamente e o claim
some do token.

## 3. Senha

Aba **Credentials** → _Set password_. Use uma senha forte gerada na hora e
deixe **Temporary: On** — assim ela vale só até o primeiro login e o valor não
fica valendo como credencial permanente em lugar nenhum.

Guarde-a no gerenciador de senhas, não no Railway: a API não precisa dela.

## 4. Copiar o `sub`

Aba **Details** do usuário → campo **ID**. É o `sub` que o token vai carregar e
é por ele que a API amarra a identidade externa. Copie.

Alternativa pela URL: o ID é o último segmento de
`/admin/master/console/#/transportada/users/<ID>/settings`.

> Não é preciso atribuir nenhum _role_ do realm (`company-admin`, `operator`…).
> A autorização da aplicação vem do vínculo no banco, criado no passo 6; os
> papéis do realm existem para uso futuro e não são lidos pela API.

## 5. Variáveis no serviço `api`

Railway → ambiente correto → serviço `api` → _Variables_:

| Variável                  | Valor                          |
| ------------------------- | ------------------------------ |
| `PROVISION_COMPANY_ID`    | o UUID gerado antes do passo 1 |
| `PROVISION_ADMIN_SUBJECT` | o ID copiado no passo 4        |

`PROVISION_COMPANY_ID` sozinho é configuração completa: garante a empresa do
ambiente e para aí, deixando o administrador para o primeiro acesso (ADR-0022).
`PROVISION_ADMIN_SUBJECT` sozinho **falha o deploy** — não há empresa a que
vinculá-lo. Com as duas vazias o passo imprime `{"provisioning":"skipped"}` e o
deploy segue.

Confira também que `KEYCLOAK_ISSUER` do serviço `api` aponta para o realm onde o
usuário foi criado. A identidade é chaveada por `issuer` + `subject`; issuer
diferente significa usuário diferente para a API, mesmo com o mesmo `sub`.

## 6. Ligar o config-as-code do `api`

Railway → serviço `api` → _Settings_ → campo **Config-as-code** →
`deploy/api/railway.json`. **Um por serviço e por ambiente.**

Sem esse campo preenchido nada do `railway.json` roda: não há migration no
pre-deploy, não há provisionamento e não há healthcheck. É o passo que mais
costuma ser esquecido.

## 7. Provisionar

Com o passo 6 feito, o próximo deploy do `api` roda sozinho, antes de trocar o
tráfego:

```text
bun src/database/database-migration.service.ts
bun src/database/environment-provisioning.service.ts
```

Nos logs do deploy o segundo comando imprime o resultado:

```json
{
  "companyId": "…",
  "created": ["company", "identity-user", "external-identity", "membership", "company-admin-role"]
}
```

Rodar de novo com a mesma configuração é idempotente: `created` volta vazio.

Se ainda não quiser depender do config-as-code, dá para rodar por dentro do
contêiner (o banco não é acessível de fora):

```bash
railway ssh --service api --environment staging \
  bun src/database/environment-provisioning.service.ts
```

## 8. Verificar

1. Abrir o frontend do ambiente e logar com o usuário criado. O Keycloak vai
   exigir a troca de senha (senha temporária) e devolver para a aplicação.
2. Uma chamada autenticada precisa responder `200`, não `403`:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     https://api-staging-5633.up.railway.app/operations/summary
   ```

   `403` aqui significa token válido **sem** vínculo ativo — releia os passos 4
   e 5: quase sempre é `PROVISION_ADMIN_SUBJECT` diferente do ID real do
   usuário, ou provisionamento que nunca rodou porque o passo 6 ficou aberto.

## Checklist

- [ ] UUID da empresa gerado e anotado
- [ ] Usuário criado no realm `transportada` (não no `master`)
- [ ] `company_id` no usuário = UUID anotado
- [ ] Senha temporária definida e guardada fora do Railway
- [ ] `sub` copiado da aba _Details_
- [ ] `PROVISION_COMPANY_ID` e `PROVISION_ADMIN_SUBJECT` no serviço `api`
- [ ] `KEYCLOAK_ISSUER` apontando para o mesmo realm
- [ ] Config-as-code do `api` = `deploy/api/railway.json`
- [ ] Deploy rodado e log do provisionamento conferido
- [ ] Login no frontend e chamada autenticada em `200`

## Erros comuns

| Sintoma                                            | Causa provável                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Login funciona, aplicação diz "sem acesso" (`403`) | `PROVISION_ADMIN_SUBJECT` errado, ou provisionamento não rodou      |
| Deploy falha em `PROVISION_COMPANY_ID_INVALID`     | valor não é UUID válido, ou só `PROVISION_ADMIN_SUBJECT` declarada  |
| Deploy recusa com conflito de vínculo              | o vínculo existe mas foi desabilitado à mão — o comando não reativa |
| Claim `company_id` some do token                   | atributo salvo em realm sem `unmanagedAttributePolicy: ENABLED`     |
| Nada do `railway.json` acontece                    | config-as-code não preenchido naquele par serviço/ambiente          |
