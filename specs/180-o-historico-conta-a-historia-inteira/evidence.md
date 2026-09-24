
## T102 — o seeder grava o perfil de identidade

Causa provada com consulta ao banco local: `trip_document_events` de `loaded` tinham
`actor_user_id`, resolviam em `identity_users` e tinham `user_company_memberships` **ativa** — e a
tela dizia "por usuário removido". Faltava a linha em `identity_user_profiles`, que é de onde a
autoria lê o nome (`timelineActorProfile`).

O seed parava em `identity_users`; os três caminhos de criação em produção gravam usuário e perfil
na mesma transação, então produção nunca chega nesse estado.

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src/database                 # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7212 pass · 0 fail · 183 arquivos [30.32s]
```

⚠️ A tela afirmar remoção sobre qualquer nome ausente é defeito à parte, que vale em produção — é o
RF3/T201 desta spec, e não foi corrigido aqui.
