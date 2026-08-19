-- ─────────────────────────────────────────────────────────────────────────────
-- Endurecimento final de permissões e entradas públicas.
--
-- PostgreSQL concede EXECUTE em funções novas ao pseudo-papel PUBLIC por
-- padrão. Revogamos esse acesso das funções SECURITY DEFINER e liberamos só as
-- RPCs realmente usadas por sessões autenticadas. Também limitamos os campos
-- que chegam do cadastro público para evitar abuso por payloads gigantes.
-- ─────────────────────────────────────────────────────────────────────────────

revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;

do $$
declare
  f record;
begin
  for f in
    select
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke all on function public.%I(%s) from public',
      f.proname,
      f.args
    );
    execute format(
      'revoke all on function public.%I(%s) from anon',
      f.proname,
      f.args
    );

    if f.proname = any(array[
      'current_org_id',
      'current_papel',
      'garantir_empresa',
      'is_platform_admin',
      'criar_venda',
      'cancelar_venda',
      'devolver_itens_venda',
      'converter_condicional_venda',
      'registrar_pagamento_promissoria',
      'lancar_despesa_recorrente',
      'listar_responsaveis',
      'log_auditoria',
      'registrar_movimentacao'
    ]) then
      execute format(
        'grant execute on function public.%I(%s) to authenticated',
        f.proname,
        f.args
      );
    else
      execute format(
        'revoke all on function public.%I(%s) from authenticated',
        f.proname,
        f.args
      );
    end if;
  end loop;
end;
$$;

-- Restringe o tamanho dos dados vindos do metadata de auth.users. NOT VALID
-- permite instalar com segurança e, após a limpeza abaixo, validar sem janela.
update public.access_requests
set
  email = left(email, 320),
  nome = left(nome, 160),
  nome_loja = left(nome_loja, 160)
where length(email) > 320
   or length(coalesce(nome, '')) > 160
   or length(coalesce(nome_loja, '')) > 160;

alter table public.access_requests
  drop constraint if exists access_requests_email_tamanho_check;
alter table public.access_requests
  add constraint access_requests_email_tamanho_check
  check (length(email) between 3 and 320) not valid;
alter table public.access_requests
  validate constraint access_requests_email_tamanho_check;

alter table public.access_requests
  drop constraint if exists access_requests_nome_tamanho_check;
alter table public.access_requests
  add constraint access_requests_nome_tamanho_check
  check (nome is null or length(nome) <= 160) not valid;
alter table public.access_requests
  validate constraint access_requests_nome_tamanho_check;

alter table public.access_requests
  drop constraint if exists access_requests_loja_tamanho_check;
alter table public.access_requests
  add constraint access_requests_loja_tamanho_check
  check (nome_loja is null or length(nome_loja) <= 160) not valid;
alter table public.access_requests
  validate constraint access_requests_loja_tamanho_check;

-- Atualiza o trigger para cortar o payload antes do INSERT, em vez de depender
-- de erro de constraint em um cadastro legítimo com texto acidentalmente longo.
create or replace function public.fn_criar_pedido_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.access_requests (
    user_id, email, nome, nome_loja, status
  ) values (
    NEW.id,
    left(coalesce(NEW.email, ''), 320),
    nullif(left(NEW.raw_user_meta_data ->> 'nome', 160), ''),
    nullif(left(NEW.raw_user_meta_data ->> 'nome_loja', 160), ''),
    'pendente'
  )
  on conflict (user_id) do update
    set email = excluded.email,
        nome = coalesce(public.access_requests.nome, excluded.nome),
        nome_loja = coalesce(public.access_requests.nome_loja, excluded.nome_loja),
        updated_at = now();
  return NEW;
end;
$$;

revoke all on function public.fn_criar_pedido_acesso() from public;
revoke all on function public.fn_criar_pedido_acesso() from anon;
revoke all on function public.fn_criar_pedido_acesso() from authenticated;
