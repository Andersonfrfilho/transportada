-- Spec 100 D5c: se este motorista amarra a carga com cinta.
--
-- ⚠️ `false` por padrão, e o padrão é o que decide: a planta limita a altura da pilha por esbeltez
-- (a pilha tomba quando a inclinação equivalente passa de `atan(base / altura)`), e supor cinta por
-- omissão desenharia pilha alta para quem não amarra. Quem amarra declara.
alter table fleet_drivers
  add column secures_cargo boolean not null default false;

comment on column fleet_drivers.secures_cargo is
  'Motorista amarra a carga com cinta; libera a planta a empilhar até o teto do baú (spec 100).';
