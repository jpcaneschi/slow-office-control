import { ModuleCard } from "@/components/dashboard/module-card";
import { ModuleEmptyState } from "@/components/dashboard/module-empty-state";
import { PageHeader } from "@/components/dashboard/page-header";

export default function RelatoriosPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Módulo analítico"
        title="Relatórios / PDFs"
        description="Esta área será responsável por exportações, relatórios operacionais e geração de PDFs com visual profissional para uso interno e externo."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ModuleCard
          title="PDFs internos"
          description="Relatórios completos para controle operacional, com visão detalhada da loja."
          accent="neutral"
        />

        <ModuleCard
          title="PDFs para cliente"
          description="Documentos organizados, bonitos e legíveis, sem exibir custo interno da operação."
          accent="red"
        />

        <ModuleCard
          title="Exportações futuras"
          description="Esta área também será preparada para exportações em CSV e Excel em etapas futuras."
          accent="blue"
        />
      </div>

      <ModuleEmptyState
        title="Área preparada para documentos e relatórios"
        description="A página já cria a base visual correta para um módulo importante de saída de informação e prestação de contas."
        nextStep="Criar os primeiros PDFs principais: venda, promissória e relatório interno."
      />
    </section>
  );
}