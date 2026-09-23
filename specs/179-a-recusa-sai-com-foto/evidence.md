
## T103 — schema, repositório e use-case leem e gravam os dois campos

```
$ bunx tsc --noEmit                        # sem saída
$ bunx eslint src test drizzle.config.ts   # sem saída
$ bun --env-file=../../.env.test test --timeout 120000
 7185 pass · 23 skip · 0 fail · 24250 expect() · 183 arquivos [34.43s]
$ bun --env-file=../../.env.test run test:integration
 566 pass · 7 skip · 0 fail · 105 arquivos [785.89s]
```

⚠️ A primeira execução da integração foi descartada: dois processos rodavam contra o mesmo banco de
teste (um meu, um do agente), e resultado de suíte concorrente não é evidência. Os números acima são
de uma execução única, com os outros processos encerrados.
