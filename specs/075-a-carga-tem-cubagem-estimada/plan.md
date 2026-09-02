# Plano — 075 A carga tem cubagem estimada

## Forma da solução

Espelho da 067, com uma tabela a mais e uma assimetria.

- **`company_cargo_volume_factors`** — `(company_id, species)`, com `species = ''` como linha
  padrão. Fator em `numeric`, CHECK recusando zero e negativo. Nulo não existe aqui: a **ausência
  da linha** é o desligado, e é o estado inicial.
- **`vehicle_volume_references`** — `(vehicle_type, body_type)`, sem `company_id`: é catálogo de
  mercado, como `fuel_price_references` (a única outra tabela sem tenant, por decisão registrada).
  ⚠️ Se ela nascer com tenant, vira configuração por empresa e a spec muda de tamanho.
- **`resolveCargoVolume`** em `nfe-documents/domain/cargo-volume.policy.ts`, ao lado da de peso,
  com a mesma forma: escalado em `bigint`, `divideHalfUp`, `formatScaledDecimal`.
- **`resolveVehicleCapacity`** em `fleet/domain/`, decidindo entre ficha e referência.
- **Ocupação** em `trips/domain/`, somando as notas e propagando a pior origem.

## Ordem

- **Fase 0** — fechar a dúvida do fator padrão. Sem ela a Fase B não tem número.
- **Fase A** — a cubagem da nota (P1), que é a metade que não depende de veículo.
- **Fase B** — a capacidade do veículo (P2), onde mora a decisão D2 da chave composta.
- **Fase C** — a ocupação na viagem (P3).
- **Fase D** — a ilustração (P4), independente das outras três.
- **Fase E** — fecho.

## Riscos

- **A chave `(vehicle_type, body_type)` é a parte que erra fácil.** Carreta é o implemento, e o
  implemento tem tipo vazio. Um teste com cavalo + carreta acoplados, medindo qual linha responde,
  vale mais que a implementação inteira.
- **A ocupação exibida sem a marca de estimativa** vira número que parece medido — o defeito é de
  interface e não aparece em teste de domínio. Contrato na tela, não só na política.
- **A referência sem tenant** é a decisão que, invertida depois, exige migration com dados.
