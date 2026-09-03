-- Troca de produtos/tamanhos dentro de uma venda concluída.
-- A operação é atômica, preserva o valor financeiro da venda, movimenta a
-- grade correta e mantém um histórico independente dos itens atuais.

create table if not exists public.venda_trocas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  motivo text not null,
  valor_troca numeric(12,2) not null check (valor_troca >= 0),
  idempotency_key text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.venda_troca_itens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  troca_id uuid not null references public.venda_trocas(id) on delete cascade,
  venda_id uuid not null references public.vendas(id) on delete cascade,
  direcao text not null check (direcao in ('devolvido', 'novo')),
  venda_item_id uuid references public.venda_itens(id),
  produto_id uuid not null references public.produtos(id),
  variacao_id uuid references public.produto_variacoes(id),
  produto_nome text not null,
  atributos_snapshot jsonb not null default '{}'::jsonb,
  tamanho_snapshot text,
  cor_snapshot text,
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0),
  total_item numeric(12,2) not null check (total_item >= 0),
  created_at timestamptz not null default now()
);

create index if not exists venda_trocas_org_idx
  on public.venda_trocas(organization_id);
create index if not exists venda_trocas_venda_idx
  on public.venda_trocas(venda_id, created_at desc);
create unique index if not exists venda_trocas_org_idempotency_uidx
  on public.venda_trocas(organization_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists venda_troca_itens_org_idx
  on public.venda_troca_itens(organization_id);
create index if not exists venda_troca_itens_troca_idx
  on public.venda_troca_itens(troca_id);
create index if not exists venda_troca_itens_venda_idx
  on public.venda_troca_itens(venda_id);
create index if not exists venda_troca_itens_produto_idx
  on public.venda_troca_itens(produto_id);
create index if not exists venda_troca_itens_variacao_idx
  on public.venda_troca_itens(variacao_id)
  where variacao_id is not null;
create index if not exists venda_troca_itens_venda_item_idx
  on public.venda_troca_itens(venda_item_id)
  where venda_item_id is not null;

alter table public.venda_trocas enable row level security;
alter table public.venda_troca_itens enable row level security;

drop policy if exists "trocas_select_empresa" on public.venda_trocas;
create policy "trocas_select_empresa"
  on public.venda_trocas for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (select public.current_papel()) in ('owner', 'gerente', 'caixa', 'financeiro')
  );

drop policy if exists "trocas_insert_gestao" on public.venda_trocas;
create policy "trocas_insert_gestao"
  on public.venda_trocas for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and (select public.current_papel()) in ('owner', 'gerente')
  );

drop policy if exists "troca_itens_select_empresa" on public.venda_troca_itens;
create policy "troca_itens_select_empresa"
  on public.venda_troca_itens for select to authenticated
  using (
    organization_id = (select public.current_org_id())
    and (select public.current_papel()) in ('owner', 'gerente', 'caixa', 'financeiro')
  );

drop policy if exists "troca_itens_insert_gestao" on public.venda_troca_itens;
create policy "troca_itens_insert_gestao"
  on public.venda_troca_itens for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and (select public.current_papel()) in ('owner', 'gerente')
  );

revoke all on table public.venda_trocas from anon;
revoke all on table public.venda_troca_itens from anon;
grant select, insert on table public.venda_trocas to authenticated;
grant select, insert on table public.venda_troca_itens to authenticated;

create or replace function public.trocar_itens_venda(
  p_venda_id uuid,
  p_devolucoes jsonb,
  p_novos_itens jsonb,
  p_motivo text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_troca_id uuid;
  v_status text;
  v_item jsonb;
  v_vi record;
  v_prod record;
  v_produto_id uuid;
  v_variacao_id uuid;
  v_qtd integer;
  v_total_devolvido numeric := 0;
  v_total_novo numeric := 0;
  v_custo_total numeric := 0;
begin
  if v_org is null then
    raise exception 'Sessão sem empresa ativa';
  end if;
  if public.current_papel() not in ('owner', 'gerente') then
    raise exception 'Seu perfil não tem permissão para trocar itens de vendas';
  end if;
  if coalesce(trim(p_motivo), '') = '' or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo da troca';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Chave da operação não informada';
  end if;
  if jsonb_typeof(p_devolucoes) <> 'array'
     or jsonb_typeof(p_novos_itens) <> 'array'
     or jsonb_array_length(p_devolucoes) = 0
     or jsonb_array_length(p_novos_itens) = 0 then
    raise exception 'Informe os itens devolvidos e os novos itens';
  end if;

  select id into v_troca_id
  from public.venda_trocas
  where organization_id = v_org and idempotency_key = p_idempotency_key;
  if v_troca_id is not null then
    return v_troca_id;
  end if;

  select status into v_status
  from public.vendas
  where id = p_venda_id and organization_id = v_org
  for update;
  if v_status is null then
    raise exception 'Venda não encontrada ou sem acesso';
  end if;
  if v_status <> 'concluida' then
    raise exception 'Só é possível trocar itens de uma venda concluída';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_devolucoes) d
    group by d->>'venda_item_id'
    having count(*) > 1
  ) then
    raise exception 'O mesmo item devolvido foi informado mais de uma vez';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_novos_itens) n
    group by n->>'produto_id', coalesce(n->>'variacao_id', '')
    having count(*) > 1
  ) then
    raise exception 'O mesmo novo produto foi informado mais de uma vez';
  end if;

  -- Primeira passagem: valida e trava tudo antes de movimentar o estoque.
  for v_item in select value from jsonb_array_elements(p_devolucoes)
  loop
    v_qtd := (v_item->>'quantidade')::integer;
    if v_qtd <= 0 then
      raise exception 'Quantidade devolvida inválida';
    end if;

    select vi.*, p.nome as produto_nome, pv.atributos, pv.tamanho, pv.cor
      into v_vi
    from public.venda_itens vi
    join public.produtos p on p.id = vi.produto_id
    left join public.produto_variacoes pv on pv.id = vi.variacao_id
    where vi.id = (v_item->>'venda_item_id')::uuid
      and vi.venda_id = p_venda_id
      and vi.organization_id = v_org
      and p.organization_id = v_org
    for update of vi;

    if not found then
      raise exception 'Item devolvido não encontrado ou sem acesso';
    end if;
    if v_qtd > v_vi.quantidade then
      raise exception 'Quantidade devolvida maior que a vendida';
    end if;
    v_total_devolvido := v_total_devolvido + v_qtd * v_vi.preco_unitario;
  end loop;

  for v_item in select value from jsonb_array_elements(p_novos_itens)
  loop
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_variacao_id := nullif(v_item->>'variacao_id', '')::uuid;
    v_qtd := (v_item->>'quantidade')::integer;
    if v_qtd <= 0 then
      raise exception 'Quantidade do novo item inválida';
    end if;

    if v_variacao_id is not null then
      select p.id, p.nome, p.organization_id, p.status, p.tem_variacoes,
             coalesce(pv.preco, p.preco) as preco_unitario,
             coalesce(pv.custo, p.custo, 0) as custo_unitario,
             pv.estoque, pv.atributos, pv.tamanho, pv.cor, pv.status as variacao_status
        into v_prod
      from public.produtos p
      join public.produto_variacoes pv
        on pv.id = v_variacao_id
       and pv.produto_id = p.id
       and pv.organization_id = v_org
      where p.id = v_produto_id and p.organization_id = v_org
      for update of p, pv;
    else
      select p.id, p.nome, p.organization_id, p.status, p.tem_variacoes,
             p.preco as preco_unitario, coalesce(p.custo, 0) as custo_unitario,
             p.estoque, '{}'::jsonb as atributos,
             null::text as tamanho, null::text as cor, 'ativo'::text as variacao_status
        into v_prod
      from public.produtos p
      where p.id = v_produto_id and p.organization_id = v_org
      for update;
    end if;

    if not found or v_prod.status <> 'ativo' or v_prod.variacao_status <> 'ativo' then
      raise exception 'Novo produto não encontrado, inativo ou sem acesso';
    end if;
    if v_prod.tem_variacoes and v_variacao_id is null then
      raise exception 'Escolha a variação do novo produto';
    end if;
    if not v_prod.tem_variacoes and v_variacao_id is not null then
      raise exception 'Este produto não utiliza variação';
    end if;
    if v_qtd > v_prod.estoque then
      raise exception 'Estoque insuficiente para % (disponível: %)', v_prod.nome, v_prod.estoque;
    end if;
    v_total_novo := v_total_novo + v_qtd * v_prod.preco_unitario;
  end loop;

  if abs(round(v_total_novo, 2) - round(v_total_devolvido, 2)) >= 0.01 then
    raise exception 'A troca precisa manter o mesmo valor da venda';
  end if;

  insert into public.venda_trocas
    (organization_id, venda_id, motivo, valor_troca, idempotency_key, criado_por)
  values
    (v_org, p_venda_id, trim(p_motivo), round(v_total_devolvido, 2),
     p_idempotency_key, auth.uid())
  returning id into v_troca_id;

  for v_item in select value from jsonb_array_elements(p_devolucoes)
  loop
    v_qtd := (v_item->>'quantidade')::integer;
    select vi.*, p.nome as produto_nome, pv.atributos, pv.tamanho, pv.cor
      into v_vi
    from public.venda_itens vi
    join public.produtos p on p.id = vi.produto_id
    left join public.produto_variacoes pv on pv.id = vi.variacao_id
    where vi.id = (v_item->>'venda_item_id')::uuid
      and vi.venda_id = p_venda_id
      and vi.organization_id = v_org;

    insert into public.venda_troca_itens
      (organization_id, troca_id, venda_id, direcao, venda_item_id,
       produto_id, variacao_id, produto_nome, atributos_snapshot,
       tamanho_snapshot, cor_snapshot, quantidade, preco_unitario, total_item)
    values
      (v_org, v_troca_id, p_venda_id, 'devolvido', v_vi.id,
       v_vi.produto_id, v_vi.variacao_id, v_vi.produto_nome,
       coalesce(v_vi.atributos, '{}'::jsonb), v_vi.tamanho, v_vi.cor,
       v_qtd, v_vi.preco_unitario, v_qtd * v_vi.preco_unitario);

    perform public.registrar_movimentacao(
      v_vi.produto_id, 'devolucao', v_qtd, 'Troca de venda', trim(p_motivo),
      p_venda_id, v_vi.variacao_id,
      'troca-entrada-' || v_troca_id::text || '-' || v_vi.id::text
    );

    update public.venda_itens
    set quantidade = quantidade - v_qtd,
        total_item = (quantidade - v_qtd) * preco_unitario
    where id = v_vi.id;
  end loop;

  for v_item in select value from jsonb_array_elements(p_novos_itens)
  loop
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_variacao_id := nullif(v_item->>'variacao_id', '')::uuid;
    v_qtd := (v_item->>'quantidade')::integer;

    if v_variacao_id is not null then
      select p.id, p.nome, coalesce(pv.preco, p.preco) as preco_unitario,
             coalesce(pv.custo, p.custo, 0) as custo_unitario,
             pv.atributos, pv.tamanho, pv.cor
        into v_prod
      from public.produtos p
      join public.produto_variacoes pv
        on pv.id = v_variacao_id and pv.produto_id = p.id
      where p.id = v_produto_id and p.organization_id = v_org
        and pv.organization_id = v_org;
    else
      select p.id, p.nome, p.preco as preco_unitario,
             coalesce(p.custo, 0) as custo_unitario,
             '{}'::jsonb as atributos, null::text as tamanho, null::text as cor
        into v_prod
      from public.produtos p
      where p.id = v_produto_id and p.organization_id = v_org;
    end if;

    perform public.registrar_movimentacao(
      v_produto_id, 'venda', v_qtd, 'Saída por troca de venda', trim(p_motivo),
      p_venda_id, v_variacao_id,
      'troca-saida-' || v_troca_id::text || '-' || v_produto_id::text || '-' ||
        coalesce(v_variacao_id::text, 'sem-variacao')
    );

    insert into public.venda_itens
      (venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item,
       custo_unitario, organization_id, user_id)
    values
      (p_venda_id, v_produto_id, v_variacao_id, v_qtd,
       v_prod.preco_unitario, v_qtd * v_prod.preco_unitario,
       v_prod.custo_unitario, v_org, auth.uid());

    insert into public.venda_troca_itens
      (organization_id, troca_id, venda_id, direcao, produto_id, variacao_id,
       produto_nome, atributos_snapshot, tamanho_snapshot, cor_snapshot,
       quantidade, preco_unitario, total_item)
    values
      (v_org, v_troca_id, p_venda_id, 'novo', v_produto_id, v_variacao_id,
       v_prod.nome, coalesce(v_prod.atributos, '{}'::jsonb),
       v_prod.tamanho, v_prod.cor, v_qtd,
       v_prod.preco_unitario, v_qtd * v_prod.preco_unitario);
  end loop;

  select coalesce(sum(quantidade * custo_unitario), 0)
    into v_custo_total
  from public.venda_itens
  where venda_id = p_venda_id and organization_id = v_org and quantidade > 0;

  update public.vendas
  set custo_total = v_custo_total,
      margem = coalesce(valor_liquido, total) - v_custo_total,
      updated_at = now()
  where id = p_venda_id and organization_id = v_org;

  perform public.log_auditoria(
    'venda_troca', 'vendas', p_venda_id,
    jsonb_build_object(
      'troca_id', v_troca_id,
      'valor', round(v_total_devolvido, 2),
      'motivo', trim(p_motivo)
    )
  );

  return v_troca_id;
end;
$$;

revoke all on function public.trocar_itens_venda(uuid, jsonb, jsonb, text, text)
  from public, anon;
grant execute on function public.trocar_itens_venda(uuid, jsonb, jsonb, text, text)
  to authenticated;

comment on function public.trocar_itens_venda(uuid, jsonb, jsonb, text, text) is
  'Troca itens de mesmo valor em uma venda concluída, com estoque e histórico atômicos.';
