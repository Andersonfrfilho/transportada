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
