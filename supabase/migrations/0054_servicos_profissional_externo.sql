-- Consolida atendimentos especializados (tatuagem, barbearia etc.) no módulo
-- genérico de Serviços. O profissional pode ser parceiro externo e, portanto,
-- não precisa existir na tabela de funcionários.

alter table public.atendimentos_servico
  add column if not exists profissional_nome text;

update public.atendimentos_servico a
set profissional_nome = f.nome
from public.funcionarios f
where a.funcionario_id = f.id
  and nullif(btrim(a.profissional_nome), '') is null;

update public.atendimentos_servico
set profissional_nome = nullif(btrim(profissional_nome), '')
where profissional_nome is not null;

do $$
begin
  begin
    alter table public.atendimentos_servico
      add constraint chk_atendimento_profissional_nome
      check (profissional_nome is null or char_length(profissional_nome) <= 160);
  exception when duplicate_object then null;
  end;
end $$;

comment on column public.atendimentos_servico.profissional_nome is
  'Nome do funcionário ou parceiro externo que executou o serviço.';
