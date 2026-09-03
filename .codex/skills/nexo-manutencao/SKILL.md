---
name: nexo-manutencao
description: Auditar, manter, corrigir e publicar o Nexo Gestão com isolamento multicliente, migrações aditivas, reconciliação rastreável de estoque e verificação ponta a ponta. Use quando o usuário pedir manutenção, diagnóstico, importação, correção, publicação ou revisão do sistema Nexo.
---

# Guardião Nexo

Trate o Nexo como um SaaS multicliente em produção. Preserve primeiro os dados
operacionais; depois implemente, valide e publique a menor mudança segura.

## Regras invioláveis

- Nunca resetar, truncar, apagar em massa ou substituir vendas, clientes,
  produtos, estoque, financeiro, funcionários ou arquivos de uma organização.
- Nunca copiar dados entre organizações. Todo registro operacional deve ter
  `organization_id`, e toda leitura/escrita deve respeitar a organização atual.
- Nunca conceder a um cliente acesso a dados, módulos ou identidades de outro.
  Administrador da plataforma e membro de loja são papéis distintos.
- Não fixar UUIDs gerados em migrações. Resolver organizações e registros por
  chaves naturais verificadas e abortar se o resultado não for único.
- Não fazer ajustes silenciosos de estoque. Registrar quantidade anterior,
  quantidade posterior, motivo, origem e chave de idempotência.
- Não registrar segredo, senha, token ou dado pessoal em código, commit, log ou
  resposta. Use somente credenciais já configuradas para o ambiente.

## Fluxo obrigatório

1. Ler `AGENTS.md`, confirmar branch/base e verificar alterações existentes.
2. Reproduzir o problema e mapear UI, RPCs, tabelas, RLS e efeitos financeiros.
3. Antes de qualquer migração de dados, capturar contagens e valores de controle
   apenas da organização-alvo.
4. Implementar de forma aditiva e idempotente. Funções de negócio devem ser
   `SECURITY INVOKER`, salvo justificativa explícita com checagem interna de
   organização e papel.
5. Ativar RLS em toda tabela exposta, criar políticas por organização e papel,
   revogar `anon`/`public` e conceder somente o necessário a `authenticated`.
6. Para importações, normalizar nomes, comparar CPF/e-mail/telefone/SKU/código,
   separar duplicados e inválidos e nunca sobrescrever conflito ambíguo.
7. Para estoque por grade, movimentar a variação correta. Produto com variações
   não deve usar o estoque agregado da linha principal como fonte da verdade.
8. Rodar testes direcionados, suíte completa, lint, TypeScript e build.
9. Validar em desktop e mobile os fluxos afetados, incluindo estados vazio,
   carregando, erro, sucesso e permissão negada.
10. Aplicar migrações apenas com autorização de publicação. Depois, executar os
    consultores de segurança/desempenho e repetir as contagens de controle.
11. Publicar por branch/PR, verificar o deployment e testar URLs públicas e o
    fluxo autenticado relevante quando houver acesso seguro disponível.
12. Entregar um resumo objetivo: mudanças, dados preservados, testes, migrações,
    URLs, pendências reais e como reverter sem apagar dados.

## Reconciliação de catálogo

- Tratar a fonte enviada como fotografia de um horário específico.
- Comparar por identificadores fortes e aliases revisados; não criar duplicata
  apenas porque a grafia mudou.
- Preservar produtos históricos/inativos que não aparecem na fonte.
- Antes de aplicar estoque da fotografia, verificar se houve movimentação depois
  da exportação. Se houve, abortar e pedir/recalcular uma nova conciliação.
- Usar pré-condição por linha: só atualizar quando o estoque atual for exatamente
  o valor auditado ou já for o valor desejado.

## Vendas, devoluções e trocas

- Vendas concluídas formam histórico financeiro; não editar itens diretamente.
- Cancelamentos, devoluções e trocas devem ser transações atômicas e idempotentes.
- Toda troca registra itens devolvidos e novos, ajusta as duas grades de estoque
  e mantém histórico auditável.
- Se a troca alterar o valor, criar fluxo financeiro explícito; nunca mascarar a
  diferença mudando o total antigo silenciosamente.

## Monitoramento

- O monitor automático é somente leitura: disponibilidade, carregamento de URLs
  e falhas públicas. Ele nunca altera banco, acesso ou dados por conta própria.
- Correções continuam exigindo inspeção, testes e autorização compatível com o
  escopo solicitado pelo usuário.

