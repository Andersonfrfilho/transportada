# Plano — 050 O CEP vem de casa

## Módulo novo na API: `addresses`

O CEP atravessa quatro agregados (`nfe_addresses`, `fleet_drivers`, `company_fiscal_profiles`,
`mdfe_manifests`) e não pertence a nenhum deles. Vai para `apps/api-transportada/src/addresses/`, nas
quatro camadas de sempre:

```
addresses/
  presentation/  postal-code.routes.ts · postal-code.schema.ts
  application/   lookup-postal-code.use-case.ts · postal-code.port.ts
  domain/        postal-code.error.ts · postal-code-suggestion.policy.ts
  infrastructure/ drizzle-postal-code.repository.ts · postal-code.gateway.ts
```

- **`postal-code-suggestion.policy.ts`** (puro, sem I/O): valida os oito dígitos, canonicaliza a UF,
  aplica o desempate dentro de uma origem (`street` preenchido ganha, empate resolve pela linha mais
  recente) e decide o que é sugestão **completa** — logradouro, cidade e UF preenchidos. É aqui que a
  sugestão é montada **sem** `number` e sem `complement`.
- **`drizzle-postal-code.repository.ts`**: **cinco consultas independentes em corrida**, não um
  `UNION ALL`. Uma por origem — `nfe_addresses`, `fleet_drivers`, `company_fiscal_profiles`,
  `mdfe_manifests.loading_postal_code` (projeta `origin_state`) e `mdfe_manifests.discharge_postal_code`
  (projeta `destination_state`) —, cada uma com `where company_id = $1 and postal_code = $2` no
  próprio `where`, nunca um filtro no fim que uma refatoração possa deslocar.

  A corrida é `Promise` por origem resolvida pela primeira sugestão **completa**; as demais são
  abandonadas com `AbortSignal`. `Promise.race` cru não serve: ele resolve com o primeiro a
  **terminar**, e a origem mais rápida costuma ser a que não achou nada. A semântica é "primeiro
  acerto completo vence" (`Promise.any` sobre promessas que rejeitam no vazio), com os parciais
  coletados à parte para o caso de nenhuma completar.

- **`postal-code.gateway.ts`**: BrasilAPI e depois ViaCEP, em sequência, com `AbortSignal` e timeout.
  Provedor fora do ar é degrau vazio, não erro do cadastro. O parser vem por cópia da lógica que já
  está no frontend (`fromBrasilApi` / `fromViaCep`) — que sai de lá no mesmo passo.
- **`lookup-postal-code.use-case.ts`**: corrida local → BrasilAPI → ViaCEP → parcial guardado →
  vazio. Acerto completo não chama degrau nenhum depois dele; acerto **parcial** não interrompe a
  escada, e só é devolvido quando os externos também não souberam responder.

## Índice por CEP

Nenhuma das quatro tabelas tem índice por `postal_code` hoje — `nfe_addresses` só tem a FK do
participante, e é a tabela que mais cresce do produto. A migration acrescenta
`(company_id, postal_code)` nas quatro, parcial onde a coluna admite vazio
(`where length(postal_code) > 0` em `fleet_drivers` e `mdfe_manifests`, `where postal_code is not null`
em `nfe_addresses`), com `rollback.sql` ao lado derrubando os índices. É migration aditiva: nenhum
`drop`, nenhuma coluna alterada.

## Permissão

`addresses.read` entra em `TRANSPORTADA_PERMISSIONS` e em `COMPANY_ROLE_PERMISSIONS` para
**`company-admin`, `fiscal` e `operator`** — exatamente os papéis que hoje conseguem escrever
endereço em alguma das três telas. `finance` e `viewer` não preenchem endereço, e `driver`/`aggregate`
só têm `trip.*`: dar a eles seria capacidade nova sem tela que a use.

O `realm/transportada-local-realm.json` declara **papéis**, não permissões — a expansão é código.
Não há mudança de realm nesta spec.

## Frontend

`fleet/shared/driverAddress.service.ts` perde `lookupPostalCode` e os dois parsers; entra
`shared/postalCodeClient.service.ts` (um client HTTP por módulo é a regra, mas o CEP serve três
módulos — então ele mora em `shared/`, ao lado do client base, com `fetch` injetado como os outros).

A busca por CEP passa a ser hook único (`shared/usePostalCodeLookup.hook.ts`), consumido pelos três
formulários. `useDriverAddressLookup` mantém o que é dele — a busca textual pelo Photon e o
`useGuardedRequest` — e delega o CEP.

**`404` termina em campo digitável.** O hook não desabilita, não limpa e não bloqueia envio: ele
publica um estado "não encontrado" que a tela mostra como texto de apoio ao lado do campo, e o
operador preenche à mão. Isso já é o comportamento de hoje por acidente (sugestão ausente não
sobrescreve nada); passa a ser contrato, com caso de teste — porque a tentação natural ao introduzir
uma rota nossa é tratar `404` como erro de formulário.

`EXTERNAL_CONNECT_ORIGIN` perde `https://brasilapi.com.br` e `https://viacep.com.br`. O contrato de
CSP varre `src/**` por origem `https://`, então a remoção da origem e a do `fetch` são o mesmo passo:
deixar uma sem a outra falha o teste.

## Ordem dos testes (contrato antes da implementação)

1. `test/addresses-domain/postal-code-suggestion.contract.ts` — desempate, oito dígitos, ausência de
   `number`/`complement`.
2. `test/addresses-schema/tenant-safety.contract.ts` — CEP de outra empresa não responde.
3. `test/addresses-application/lookup.contract.ts` — a escada de três degraus, com gateway falso.
4. `test/addresses-http/routes.contract.ts` — `200`/`404`, política `addresses.read`.
5. `test/authorization.contract.test.ts` — a permissão nos três papéis e ausente nos outros quatro.
6. Frontend: `test/shared/postal-code-lookup.contract.ts` e o contrato de CSP já existente.

⚠️ Cada arquivo novo entra na lista explícita de testes do `package.json` da app — suíte que não é
importada não roda e passa por verde.
