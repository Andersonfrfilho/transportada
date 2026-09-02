# Evidência — 073

## T001 — Medição em produção (2026-09-01)

Consulta agregada, somente leitura, via `railway ssh -e production -s api`. Nenhuma linha
individual lida — os números são contagens.

```
notas                 1628
com participante delivery  0
divergem do destinatário   0
entrega incompleta         0

papéis existentes em nfe_participants:
  recipient  1628
  emitter    1628
  carrier    1628
  delivery      0
  pickup        0
```

Últimas 1000 notas importadas: idem, `delivery` = 0.

### O papel é antigo, então zero é ausência de dado — não ausência de código

`NFE_PARTICIPANT_ROLE.DELIVERY` e a linha `{ party: document.delivery, role: … }` entraram em
`4e74a25e` (spec 013, **2026-07-28**), 50 commits antes de HEAD e antes de qualquer das 1628
notas. O caminho de escrita esteve ligado o tempo todo; nenhuma nota trouxe `<entrega>`.

Bate com a amostra de 345 notas reais do lote `ID1010506`: `<entrega>` em 0/345.

### O parser lê `<entrega>` — medido, não deduzido

Uma nota real do lote, com um bloco `<entrega>` injetado depois de `</dest>`, passada por
`importarNfeXml`:

```
delivery.address = { street, number, district, cityCode 3509502,
                     city Campinas, state SP, postalCode 13052000 }
recipient key     = 3549102 | 13872400 | 400
```

Endereço completo, município e CEP divergentes do destinatário. A premissa da spec —
_"o importador já grava os dois"_ — se sustenta no parser e no mapeamento.

### Consequência para a D2

D2 **revisada**: não há backfill porque não há dado, e não porque o dado já esteja lá. A
diferença importa — o caminho de escrita nunca foi exercitado por nota real, então converter os
sete leitores sem prová-lo primeiro seria ligar sete consumidores a uma linha que talvez nunca
apareça. Virou a **T002**.

---

## T002 — O caminho de escrita, provado (2026-09-01)

Teste de integração em
`apps/worker-transportada/test/nfe-import-repository.integration.test.ts`:
`persists the delivery party and its own address, apart from the recipient`.

A nota importada leva destinatário **e** `<entrega>`, com os três campos da chave de parada
divergindo (`3549102|13872400|400` contra `3509502|13052000|4500`). O teste afirma:

- os papéis gravados são `['delivery', 'emitter', 'recipient']`;
- o endereço do `delivery` chega inteiro a `nfe_addresses` — rua, número, bairro, município,
  código IBGE, CEP e UF;
- os três campos da chave divergem do endereço do destinatário;
- a linha nasce carimbada com `company_id`.

```
bun test test/nfe-import-repository.integration.test.ts
  8 pass · 0 fail · 54 expect()

make worker-integration
  65 pass · 4 skip · 0 fail   (baseline era 64 pass — o 65º é este)
```

**Resultado: a D2 se sustenta.** O importador persiste o papel `delivery` e o endereço dele.
Os sete leitores podem passar a depender dessa linha.

### O teste achou um defeito de vizinhança

O `afterAll` do arquivo apagava `nfe_participants` sem apagar `nfe_addresses` antes. Nenhuma
fixture do arquivo tinha endereço, então a FK nunca era exercida e o buraco era invisível. Com
endereço, a limpeza aborta em
`nfe_addresses_company_participant_fk`, o perfil fiscal sobra — e como o CNPJ de teste é
**único global** e outros três arquivos usam a mesma constante, os quatro passam a falhar em
`beforeAll` por chave duplicada.

Corrigido no mesmo commit: `nfeAddresses` é apagado antes de `nfeParticipants`.

⚠️ A fragilidade de fundo continua: cinco arquivos de teste compartilham o CNPJ
`12345678000190` num unique global, e só três limpam. Não é desta spec, e mexer nisso aqui
misturaria escopo — mas fica registrado, porque o sintoma (quatro arquivos falhando longe da
causa) custa mais para diagnosticar do que para consertar.

---

## Fase A — O seam (T003–T006, 2026-09-01)

**T003** `test/nfe-documents/physical-destination.contract.ts` — escrito primeiro e **falhando**
(`Cannot find module physical-destination.policy`), como manda a regra. Sete casos: entrega vence;
sem entrega nada muda; entrega incompleta cai para o destinatário; entrega sem número é válida
(`S/N` é lugar); nenhum dos dois utilizável mantém o destinatário e o caso `SEM ENDEREÇO` de hoje;
nota sem participante é `null`, não erro; a origem viaja no resultado.

**T004** `src/nfe-documents/domain/physical-destination.policy.ts` (puro) e
`src/nfe-documents/infrastructure/physical-destination.join.ts` (`destinationRolesFilter`,
`pickPhysicalDestinationByDocument`).

⚠️ **A forma do plano estava errada e foi corrigida.** Ele mandava escolher em SQL, por `coalesce`
entre dois `left join`. O critério de "utilizável" é `buildStopAddressKey` devolver não-nulo, e
levá-lo para SQL obrigaria a reescrever `normalizePostalCode` como expressão do Postgres — duas
definições da mesma regra, livres para divergir sem ninguém notar. A consulta passa a trazer os
**dois** papéis e a escolha acontece em memória: uma consulta só (RF3), uma definição só.
`mdfe-candidate-document.query.ts` já fazia assim.

**T005** `physical-destination-boundary.contract.ts` — varredura por texto de fonte afirmando que
os cinco consumidores fiscais e comerciais não importam o seam, mais uma asserção de que os cinco
caminhos existem (caminho morto passaria calado).

**T006** `physical-destination-logging.contract.ts` — o seam não registra nada, e a varredura de
campos de endereço é ancorada nos campos de que a chave de parada é feita.

```
bun test test/nfe-documents.contract.test.ts
  27 pass · 0 fail · 71 expect()
```
