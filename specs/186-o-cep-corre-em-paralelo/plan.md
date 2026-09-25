# Plano — 186

- `addresses/application/postal-code-race.service.ts` — `raceCompletePostalCodeSuggestion`: recebe
  as consultas em ordem de preferência, resolve com a primeira resposta **completa**; sem nenhuma,
  com a primeira não nula na ordem dada; rejeita se uma consulta falhar antes de haver vencedor.
- `lookup-postal-code.use-case.ts` — corre `[provider, directory]` (essa ordem é a do desempate de
  parciais: o provedor vale mais que o banco, como na 050).
- `postal-code.gateway.ts` — os provedores configurados correm pela mesma função; um
  `AbortController` compartilhado aborta os perdedores; `readAwesomeApi` lê
  `address`/`district`/`city`/`state`. Ordem: BrasilAPI, AwesomeAPI, ViaCEP.
- Config: `POSTAL_CODE_AWESOME_API_URL` (`environment.schema.ts`, `api.types.ts`, `.env.example`,
  `.railway/railway.ts` com `preserve()`); variável criada no Railway em staging antes do push.
- Testes: `test/addresses-application/lookup.contract.ts`,
  `test/addresses-infrastructure/postal-code-gateway.contract.ts`, e os dois de integração que montam
  `postalCodeProviders`.
