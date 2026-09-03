-- Reconciliação pontual do catálogo da organização Slow Office com o arquivo
-- Shopify products_export (6).zip, exportado em 03/09/2026.
--
-- Segurança:
--   * resolve a organização pelo nome (nenhum UUID gerado é fixado);
--   * não remove produtos, vendas nem movimentos existentes;
--   * só corrige estoques que ainda estejam exatamente no valor auditado;
--   * aborta tudo se houve qualquer movimentação de estoque após a auditoria;
--   * registra cada inclusão/correção no livro de estoque.

do $$
declare
  v_org uuid;
  v_owner uuid;
  v_produto uuid;
  v_variacao uuid;
  v_quantidade numeric;
  v_total integer;
  v_criado boolean;
  v_alias record;
  v_alvo record;
begin
  select count(*) into v_total
  from public.organizations
  where lower(trim(nome)) = 'slow office';

  if v_total <> 1 then
    raise exception 'Reconciliação cancelada: organização Slow Office não é única';
  end if;

  select id, owner_user_id into v_org, v_owner
  from public.organizations
  where lower(trim(nome)) = 'slow office';

  if exists (
    select 1
    from public.estoque_movimentacoes
    where organization_id = v_org
      and created_at > timestamptz '2026-09-03 13:59:00+00'
  ) then
    raise exception 'Reconciliação cancelada: houve movimentação após a exportação; faça uma nova auditoria';
  end if;

  -- Produtos já existentes com nomes abreviados: apenas completa o título e a
  -- imagem do Shopify. A grade e os estoques em uso permanecem intactos.
  for v_alias in
    select *
    from jsonb_to_recordset(
      '[
        {
          "antigo": "Camiseta Assinatura Preta",
          "novo": "Camiseta Barra x High \"ASSINATURA\" Preta",
          "imagem": "https://cdn.shopify.com/s/files/1/0960/5375/6193/files/22_47_22_855_camiseta-20assinatura-20frente-20preta-22080870.jpg?v=1787931506"
        },
        {
          "antigo": "Camiseta Assinatura Off White",
          "novo": "Camiseta Barra x High \"ASSINATURA\" Off White",
          "imagem": "https://cdn.shopify.com/s/files/1/0960/5375/6193/files/22_46_51_708_camiseta-20assinatura-20frente-20off-20white-22084020.png?v=1787931308"
        },
        {
          "antigo": "Camiseta Raízes Preta",
          "novo": "Camiseta Barra x High \"RAIZES\" Preta",
          "imagem": "https://cdn.shopify.com/s/files/1/0960/5375/6193/files/22_52_17_868_camiseta-20rai-cc-81zes-20preta-22087340.png?v=1787931395"
        },
        {
          "antigo": "Camiseta Raízes Off White",
          "novo": "Camiseta Barra x High \"RAIZES\" Off White",
          "imagem": "https://cdn.shopify.com/s/files/1/0960/5375/6193/files/22_52_47_594_camiseta-20rai-cc-81zes-20off-20white-22088580.jpg?v=1787931352"
        },
        {
          "antigo": "Short High a/c Barra Preto",
          "novo": "Short Barra x High \"High a/c Barra\" - Preto",
          "imagem": "https://cdn.shopify.com/s/files/1/0960/5375/6193/files/22_49_46_934_short-20high-20ac-20barra-20frente-22088080.png?v=1787929640"
        }
      ]'::jsonb
    ) as a(antigo text, novo text, imagem text)
  loop
    select count(*) into v_total
    from public.produtos
    where organization_id = v_org
      and nome in (v_alias.antigo, v_alias.novo);

    if v_total <> 1 then
      raise exception 'Reconciliação cancelada: esperado um único produto para %', v_alias.novo;
    end if;

    update public.produtos
    set nome = v_alias.novo,
        imagem_url = v_alias.imagem
    where organization_id = v_org
      and nome in (v_alias.antigo, v_alias.novo);
  end loop;

  -- Produto novo 1: a grade completa fica disponível para reposição futura;
  -- somente o tamanho 40 entra com uma unidade, conforme o arquivo.
  select count(*) into v_total
  from public.produtos
  where organization_id = v_org
    and lower(nome) = lower('Tênis NIKE Full Force Low Branco/Preto');

  if v_total > 1 then
    raise exception 'Reconciliação cancelada: tênis duplicado no catálogo';
  end if;

  v_criado := v_total = 0;
  if v_criado then
    insert into public.produtos
      (organization_id, user_id, nome, categoria, marca, preco, custo,
       estoque, status, imagem_url, tem_variacoes)
    values
      (v_org, v_owner, 'Tênis NIKE Full Force Low Branco/Preto', 'Tênis', 'NIKE',
       599.90, 285.67, 0, 'ativo',
       'https://cdn.shopify.com/s/files/1/0960/5375/6193/files/WhatsApp-Image-2024-04-08-at-09.24.56_1.jpg?v=1761768328',
       true)
    returning id into v_produto;

    insert into public.produto_opcoes
      (organization_id, produto_id, nome, tipo, obrigatorio, ordem, valores_permitidos)
    values
      (v_org, v_produto, 'Tamanho', 'lista', true, 0,
       '["36","37","38","39","40","41","42","43","44"]'::jsonb);

    insert into public.produto_variacoes
      (organization_id, produto_id, tamanho, atributos, estoque, status)
    select v_org, v_produto, tamanho,
           jsonb_build_object('Tamanho', tamanho),
           case when tamanho = '40' then 1 else 0 end,
           'ativo'
    from unnest(array['36','37','38','39','40','41','42','43','44']) as tamanho;

    select id into v_variacao
    from public.produto_variacoes
    where organization_id = v_org
      and produto_id = v_produto
      and tamanho = '40';

    insert into public.estoque_movimentacoes
      (organization_id, user_id, produto_id, variacao_id, tipo, quantidade,
       quantidade_anterior, quantidade_posterior, motivo, observacao,
       idempotency_key)
    values
      (v_org, v_owner, v_produto, v_variacao, 'importacao', 1, 0, 1,
       'Importação de catálogo Shopify',
       'products_export (6).zip · 03/09/2026 · tamanho 40',
       'slow-shopify-20260903-nike-full-force-40');
  end if;

  -- Produto novo 2: item de tamanho único, tratado como produto sem grade.
  select count(*) into v_total
  from public.produtos
  where organization_id = v_org
    and lower(nome) in (
      lower('Bone 3 PANEL "CLASS INVERSO" Preto/ Verde / Mostarda'),
      lower('Boné 3 PANEL "CLASS INVERSO" Preto/ Verde / Mostarda')
    );

  if v_total > 1 then
    raise exception 'Reconciliação cancelada: boné Class Inverso duplicado no catálogo';
  end if;

  if v_total = 0 then
    insert into public.produtos
      (organization_id, user_id, nome, categoria, marca, preco, custo,
       estoque, status, imagem_url, tem_variacoes)
    values
      (v_org, v_owner, 'Boné 3 PANEL "CLASS INVERSO" Preto/ Verde / Mostarda',
       'Boné', 'Class', 299.90, 142.81, 1, 'ativo',
       'https://cdn.shopify.com/s/files/1/0960/5375/6193/files/22656_1_92698055-da0f-45d3-a801-87ab87875586.jpg?v=1780664461',
       false)
    returning id into v_produto;

    insert into public.estoque_movimentacoes
      (organization_id, user_id, produto_id, tipo, quantidade,
       quantidade_anterior, quantidade_posterior, motivo, observacao,
       idempotency_key)
    values
      (v_org, v_owner, v_produto, 'importacao', 1, 0, 1,
       'Importação de catálogo Shopify',
       'products_export (6).zip · 03/09/2026 · tamanho único',
       'slow-shopify-20260903-class-inverso-unico');
  end if;

  -- Diferenças objetivas de estoque detectadas na comparação. Cada linha só é
  -- atualizada se ainda estiver no valor auditado (zero), evitando sobrescrever
  -- uma venda, reposição ou ajuste realizado durante a publicação.
  for v_alvo in
    select *
    from jsonb_to_recordset(
      '[
        {"nome":"Bandeja De Bambu HIGH Logo", "tamanho":null, "esperado":0, "novo":1, "chave":"bandeja-bambu"},
        {"nome":"Camiseta QUADRO Qc Circuit Boxy Off White", "tamanho":"G", "esperado":0, "novo":1, "chave":"qc-circuit-g"},
        {"nome":"Camiseta QUADRO Qc Circuit Boxy Off White", "tamanho":"GG", "esperado":0, "novo":1, "chave":"qc-circuit-gg"},
        {"nome":"Short BARRA Nervuras \"B Garça\" Cinza", "tamanho":"GGG", "esperado":0, "novo":1, "chave":"b-garca-ggg"},
        {"nome":"Camiseta CLASS \"AMERICA LATINA\" Black", "tamanho":"GGG", "esperado":0, "novo":1, "chave":"america-latina-ggg"},
        {"nome":"Camiseta Barra \"BANDEIRAS\" Preta", "tamanho":"M", "esperado":0, "novo":1, "chave":"bandeiras-m"}
      ]'::jsonb
    ) as a(nome text, tamanho text, esperado numeric, novo numeric, chave text)
  loop
    select count(*) into v_total
    from public.produtos
    where organization_id = v_org and nome = v_alvo.nome;
    if v_total <> 1 then
      raise exception 'Reconciliação cancelada: produto ausente ou duplicado: %', v_alvo.nome;
    end if;

    select id into v_produto
    from public.produtos
    where organization_id = v_org and nome = v_alvo.nome;

    if v_alvo.tamanho is null then
      select estoque into v_quantidade
      from public.produtos
      where id = v_produto and organization_id = v_org
      for update;
      v_variacao := null;
    else
      select count(*) into v_total
      from public.produto_variacoes
      where organization_id = v_org
        and produto_id = v_produto
        and upper(coalesce(tamanho, '')) = upper(v_alvo.tamanho);
      if v_total <> 1 then
        raise exception 'Reconciliação cancelada: variação % / % ausente ou duplicada', v_alvo.nome, v_alvo.tamanho;
      end if;

      select id, estoque into v_variacao, v_quantidade
      from public.produto_variacoes
      where organization_id = v_org
        and produto_id = v_produto
        and upper(coalesce(tamanho, '')) = upper(v_alvo.tamanho)
      for update;
    end if;

    if v_quantidade = v_alvo.novo then
      continue;
    end if;
    if v_quantidade <> v_alvo.esperado then
      raise exception 'Reconciliação cancelada: estoque de % / % mudou de % para %',
        v_alvo.nome, coalesce(v_alvo.tamanho, 'sem variação'),
        v_alvo.esperado, v_quantidade;
    end if;

    insert into public.estoque_movimentacoes
      (organization_id, user_id, produto_id, variacao_id, tipo, quantidade,
       quantidade_anterior, quantidade_posterior, motivo, observacao,
       idempotency_key)
    values
      (v_org, v_owner, v_produto, v_variacao, 'importacao',
       (v_alvo.novo - v_alvo.esperado)::integer,
       v_alvo.esperado, v_alvo.novo,
       'Reconciliação de catálogo Shopify',
       'products_export (6).zip · 03/09/2026',
       'slow-shopify-20260903-' || v_alvo.chave);

    if v_variacao is null then
      update public.produtos
      set estoque = v_alvo.novo::integer
      where id = v_produto and organization_id = v_org;
    else
      update public.produto_variacoes
      set estoque = v_alvo.novo
      where id = v_variacao and organization_id = v_org;
    end if;
  end loop;
end;
$$;
