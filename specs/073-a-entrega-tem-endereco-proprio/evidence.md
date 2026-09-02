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
