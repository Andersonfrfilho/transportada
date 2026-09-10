# Spec 112 — evidências

## T1

- Vermelho antes da implementação: `Export named 'MultiVehicleSuggestionStopClaimedTwiceError' not
found` — a classe ainda não existia.
- Contratos novos em `test/routing-application/multi-vehicle-suggestion.contract.ts`: a parada e as
  notas dela mudam de caminhão; os dois caminhões do movimento nascem sem horário; a mesma parada em
  dois caminhões é 400 sem consumir a proposta; caminhão que perdeu todas as paradas não vira viagem.
- Regressão pega e corrigida no caminho: a primeira versão também derrubava grupo que **nunca** teve
  chave de parada, e dois contratos antigos dependem de ele virar viagem. A regra ficou restrita a
  quem perdeu todas as paradas para outros.
- Verde: `routing-application` 65, `routing-http` 22, `suggestion-valuation` 20. Tipos limpos.

## T2, T3 e T4

- `test/trip/proposal-stop-move.contract.ts`: o movimento leva a parada inteira (qualquer nota dela);
  os dois caminhões tocados; só caminhão com teto e sobra de peso é oferecido, e desconhecido não
  cabe; cabe exatamente no teto e não cabe um grama acima; o peso da parada só existe com toda nota
  pesada; o aceite leva a ordem de quem **só ganhou** parada, reconciliada com a ordem salva.
- Fiação: o select só aparece com opção e nunca na parada marcada para sair; parada `cidade:` não
  ganha select; rascunho pausa carga, conta e rota e segura o último número medido; a linha
  recolhida do caminhão alterado mostra a conta como ausência.
- "Salvar ordem" virou "Salvar alterações", um só para ordem e movimento: um movimento mexe em dois
  caminhões, e um salvar por caminhão deixaria meia mudança para o aceite.
- Verde: `trip` 641, `trip-financials` 24. Tipos limpos.

## Integração contra Postgres

- `bun --env-file=.env.test test ./test/integration/multi-vehicle-suggestion.integration.ts` (API):
  **7 pass, 0 fail**, contra o container de teste (`localhost:65432`), num banco descartável criado e
  apagado pelo próprio teste. O caso novo move a única parada do primeiro caminhão para o segundo e
  confere no banco: uma viagem só, 3 notas vinculadas, 2 paradas — as duas notas da parada movida
  foram junto. É a prova de que `readGroups` devolve o mapeamento nota→parada de verdade, e não só o
  repositório de mentira do contrato de aplicação.
