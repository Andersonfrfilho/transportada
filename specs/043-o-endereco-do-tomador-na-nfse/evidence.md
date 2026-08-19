# 043 — Evidência

## Origem do achado

Reemissão da fatura de Ribeirão Preto (T017 da 042) executada em produção. A prefeitura recusou:

```
NOTA_RP_UNKNOWN — É necessário informar o endereço completo do cliente
Tentativas 1 · Atualizada em 18/08/2026 21:05:07
```

Confirmado no código, não por inferência: `buildRps` em
`apps/worker-transportada/src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts` montava o RPS com
CNPJ e razão social do tomador e nenhum campo de endereço. A coleção oficial da v2 declara o bloco
`Cep · Endereco · Numero · Complemento · Bairro · Cidade · Estado · Telefone · Email`, e de
`cadastro.localizacao` vir com strings simples é que se lê `Cidade` como **nome** e `Estado` como
**sigla** — código IBGE na v2 aparece sempre como `Codigo*`/`Municipio*`.

## T001 · T002 — Endereço completo é decisão de domínio ✅

`apps/api-transportada/src/nfse-invoices/domain/nfse-taker-address.policy.ts`: oito campos anuláveis
entram, oito resolvidos saem — ou `null`. Obrigatórios: cidade, bairro, número, CEP de oito dígitos, UF
de duas letras, logradouro. Canonicaliza CEP (tira máscara) e UF (sobe caixa) no caminho.

`test/nfse-domain/taker-address.contract.ts`, importado por `test/nfse-domain.contract.test.ts` —
entrypoint fino já existente, então nada a acrescentar no `package.json`.

⚠️ As suítes de aceite foram escritas antes da implementação da sua task, mas a saída do vermelho não
ficou transcrita aqui; o que está registrado abaixo é o verde.

## T003 · T004 — Bloqueio na prévia e projeção ✅

`NFSE_SELECTION_BLOCK_REASON.missingTakerAddress` = `NFSE_DOCUMENT_MISSING_TAKER_ADDRESS`.
`selectNfseCandidates` resolve o endereço do participante que o `taker` do perfil escolhe (`0`
remetente, `3` destinatário) e bloqueia antes de o documento virar candidato — a suíte cobre os dois
papéis, para o bloqueio não passar a olhar sempre o destinatário.

`NfseProjectionDocument` e `NfseProjection` ganharam `takerAddress`; `projectGroup` usa o da primeira
nota, com o porquê no código: o grupo é o mesmo CNPJ de tomador.

## T005 — A query lê o que já existia no banco ✅

`loadParties` em `nfse-invoice-selection.query.ts` passou a selecionar `complement · district ·
number · phone · postalCode · street` junto de cidade e UF, todos de `nfe_addresses`. Nomes conferidos
contra `nfe.schema.ts`. Participante sem linha no join cai em `EMPTY_ADDRESS` — endereço todo nulo, que
a política de T002 recusa como incompleto.

O join tenant-safe `buildNfseSelectionPartyAddressJoin()` (`companyId` + `participantId`) não foi
tocado.

## T006 — Congelamento ✅

`freezeNfseIssuancePayload` grava `taker: { address, legalName, taxId }` — dentro do `payloadSha256`,
porque o endereço é parte do que a empresa aprovou na prévia. `buildNfseProviderConfig` segue fora do
payload e do hash, para credencial corrigida valer na tentativa seguinte.

Teste novo em `test/nfse-invoices-application/invoice-creation.contract.ts` afirma o `taker` congelado
inteiro. O teste vizinho — "nem o payload nem o providerConfig carregam segredo" — continua verde: o
bloco novo não traz segredo nenhum.

## T007 · T008 — O RPS carrega o endereço ✅

`payloadSchema.taker.address` é **opcional**, com a razão no código: payload congelado antes desta
mudança não pode virar `invalid_payload`, porque isso trocaria a recusa da prefeitura — a causa real —
por um defeito nosso no diagnóstico. `buildTakerAddressFields` devolve `{}` nesse caso e o RPS sai como
saía; a nota é recusada pela prefeitura, que é o diagnóstico correto.

Com endereço, saem `Bairro · Cep · Cidade · Endereco · Estado · Numero`, e `Complemento`/`Telefone`
só quando não vazios. `Email` segue omitido — `nfe_addresses` não tem a coluna — e `EnviarEmail: false`
não mudou.

`nota-rp-parity.contract.ts` passou sem alteração: a tradução de resposta e de causas de falha não foi
tocada.

## T009 — Frontend ✅

`NFSE_DOCUMENT_MISSING_TAKER_ADDRESS → documentMissingTakerAddress` no
`NFSE_INVOICE_FEEDBACK_KEY_BY_ERROR`, verbete acentuado em `nfseInvoice.locale.json` ("Uma das notas
não traz o endereço completo do tomador, e a prefeitura recusa a nota sem ele.") e o par em inglês. O
código entrou em `API_ERROR_CODES` do contrato — é essa lista que reprova código de domínio sem frase.

## Gates

Suítes tocadas:

```
bun test --cwd apps/api-transportada nfse-domain + nfse-invoices-application + nfse-invoices-http
→ 197 pass, 0 fail
bun test --cwd apps/worker-transportada nfse-fiscal-gateway + nota-rp-v2-client
→ 49 pass, 0 fail
bun test --cwd apps/frontend-transportada nfse-invoice + shared
→ 361 pass, 0 fail
```

Suítes completas:

```
bun run --cwd apps/api-transportada test       → 2607 pass, 15 skip, 0 fail
bun run --cwd apps/worker-transportada test    → 480 pass, 0 fail
bun run --cwd apps/frontend-transportada test  → 1356 pass, 0 fail
bun run typecheck                              → limpo nas quatro apps
bun run lint                                   → limpo nas quatro apps
bun run format:check                           → All matched files use Prettier code style!
```

O typecheck pegou o que os testes não pegariam: `test/fixtures/nfse-invoices-http.fixture.ts` montava
`NfseInvoicePreviewItem` sem `takerAddress`. Corrigido no fixture — o campo é obrigatório na projeção
de propósito.

`make check` completo e `make migration-test` não foram rodados: não há migration nesta spec (nenhuma
coluna nova — o endereço já existia em `nfe_addresses`), e os cinco passos do gate foram executados um
a um acima.

## Registrado

**A resposta da prévia não ganhou o endereço.** `serializePreviewInvoice` escolhe campo por campo e
continua sem `takerAddress`. Não é esquecimento: a tela já mostra o endereço na nota, e dado de cliente
a mais no fio não resolve nada.

**O cron não recebeu cópia.** O trilho de NFS-e dele consulta situação e baixa documento; não tem
`/emitir`, `buildRps` nem `payloadSchema`. Nada a espelhar.

## T010 — pendente

Depende deste merge no ar. As 16 notas de Ribeirão Preto pedem **descarte e emissão nova** — reemitir
retransmite o payload congelado sem endereço.
