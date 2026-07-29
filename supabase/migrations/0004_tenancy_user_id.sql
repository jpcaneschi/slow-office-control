-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2.2 — Multi-tenancy (1 login por empresa)
-- Adiciona a coluna user_id (dono) em cada tabela de dados, com padrão
-- auth.uid() para que novos registros já nasçam com o dono correto.
-- Depois, migra todos os dados existentes para a conta do administrador.
-- Este passo NÃO tranca o acesso ainda (isso é a Fase 2.3 / RLS).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Coluna user_id em cada tabela ------------------------------------------------
alter table public.clientes                add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.produtos                add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.vendas                  add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.venda_itens             add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.condicionais            add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.condicional_itens       add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.promissorias            add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.despesas                add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.estoque_movimentacoes   add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.eventos                 add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.notificacoes            add column if not exists user_id uuid references auth.users(id) default auth.uid();
alter table public.configuracoes           add column if not exists user_id uuid references auth.users(id) default auth.uid();

-- 2) Migrar dados existentes para a conta do administrador ------------------------
--    (todos os registros sem dono passam a pertencer a este e-mail)
do $$
declare
  admin_id uuid;
begin
  select id into admin_id from auth.users where email = 'jv.coutiinho@gmail.com' limit 1;

  if admin_id is null then
    raise notice 'Usuario administrador nao encontrado; nada foi migrado.';
    return;
  end if;

  update public.clientes              set user_id = admin_id where user_id is null;
  update public.produtos              set user_id = admin_id where user_id is null;
  update public.vendas                set user_id = admin_id where user_id is null;
  update public.venda_itens           set user_id = admin_id where user_id is null;
  update public.condicionais          set user_id = admin_id where user_id is null;
  update public.condicional_itens     set user_id = admin_id where user_id is null;
  update public.promissorias          set user_id = admin_id where user_id is null;
  update public.despesas              set user_id = admin_id where user_id is null;
  update public.estoque_movimentacoes set user_id = admin_id where user_id is null;
  update public.eventos               set user_id = admin_id where user_id is null;
  update public.notificacoes          set user_id = admin_id where user_id is null;
  update public.configuracoes         set user_id = admin_id where user_id is null;
end $$;
