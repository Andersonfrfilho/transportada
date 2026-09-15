# ADR-0065 — O ajudante é tripulação, e não condutor

- **Data:** 2026-09-14
- **Estado:** aceita
- **Contexto:** habilita D1, D5, D6 e D11 da **spec 149**. Estende a ADR-0023 (tripulação da viagem com o
  desenho de `mdfe_manifest_drivers`) e a ADR-0055 (a sugestão escolhe quem dirige).

## Contexto

A viagem já guarda até 10 pessoas em `trip_drivers`, e o MDF-e da viagem leva todas como condutores
(`create-trip-mdfe-manifest.use-case.ts`). A operação sai com ajudantes, que carregam e descarregam mas não
dirigem. Pôr o ajudante em `trip_drivers` como está hoje o declararia condutor à SEFAZ.

## Decisão

1. **Uma tabela, um papel.** `trip_drivers.role` (`driver` | `helper`, VARCHAR com check, padrão `driver`).
   Uma segunda tabela de ajudantes duplicaria o caminho do PWA
   (`membership → fleet_drivers → trip_drivers → trip`), dos comprovantes e dos relatos de campo — todos já partem desta.
2. **A pessoa é a ficha do motorista.** `fleet_drivers.can_act_as_helper` diz quem pode ajudar; a mesma
   ficha dirige numa viagem e ajuda em outra. Ajudante sem CNH usa a mesma ficha, com a CNH vazia (já
   permitido: CNH única só quando preenchida).
3. **Condutor fiscal é só `role = driver`.** O MDF-e filtra o papel; a posição 1 (o "principal" das
   ocorrências) é sempre um motorista.
4. **Uma pessoa, um lugar por proposta.** A unicidade da ADR-0055 (o mesmo motorista em dois pares é 409)
   vale para a tripulação inteira: ninguém aparece em dois veículos, nem como motorista e ajudante.

## Consequências

- Migration aditiva: linhas existentes viram `driver`, e nenhum MDF-e muda.
- Todo leitor de `trip_drivers` que quer "quem dirige" precisa filtrar o papel. A lista é conhecida:
  MDF-e, custo do motorista (`trip-driver-cost.policy.ts`), feed de ocorrências (posição 1), resumo
  financeiro por motorista e o score da spec 149.
- O ajudante com acesso vê a viagem no PWA pelo mesmo caminho.
