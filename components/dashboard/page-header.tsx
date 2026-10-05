type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

const ORIENTACOES: Record<string, string[]> = {
  "Promissórias": ["Crie um acordo com cliente, produtos e datas combinadas.", "Registre cada pagamento. O saldo é atualizado automaticamente.", "Use Mensagem e PDF para conferir o texto e enviar a posição atual ao cliente."],
  "Condicional": ["Selecione o cliente e as peças que sairão para avaliação.", "Combine o prazo de retorno. Na conferência, marque o que foi comprado ou devolvido.", "Compartilhe o PDF atualizado. A compra e o pagamento ficam na venda."],
  "Vendas": ["Escolha os produtos e confira tamanho, quantidade e valor.", "Identifique o cliente ou use Cliente avulso. Confira a data e a forma de pagamento.", "Revise o total antes de concluir. Abra a venda para consultar os detalhes."],
  "Produtos": ["Busque o produto antes de cadastrar para evitar duplicidade.", "Cadastre nome, preço de venda e os tamanhos ou cores disponíveis.", "Confira o estoque de cada variação antes de salvar."],
  "Clientes": ["Pesquise pelo nome ou telefone antes de criar um cadastro.", "Preencha os dados disponíveis. CPF e nascimento são opcionais.", "Abra o cliente para consultar compras e pagamentos."],
  "Financeiro": ["Registre cada conta com valor, categoria e vencimento.", "Marque como paga somente após realizar o pagamento.", "Confira o período selecionado para acompanhar entradas, saídas e pendências."],
  "Relatórios / PDFs": ["Escolha o documento que deseja gerar.", "Confira os dados, valores e datas antes de baixar.", "Para um acordo existente, use Promissórias e gere a posição atualizada."],
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#2563eb]">
        {eyebrow}
      </p>

      <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#0f172a] sm:text-3xl">
        {title}
      </h1>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748b]">
        {description}
      </p>
      {ORIENTACOES[title] && <details className="mt-3 max-w-3xl text-sm text-[#475569]">
        <summary className="w-fit cursor-pointer rounded-lg px-1 py-2 font-semibold text-[#2563eb]">Como usar esta página</summary>
        <ol className="mt-2 list-decimal space-y-2 rounded-xl border border-[#e8ecf4] bg-white py-4 pl-9 pr-4 leading-6">{ORIENTACOES[title].map((texto) => <li key={texto}>{texto}</li>)}</ol>
      </details>}
    </div>
  );
}
