import { ModuleCard } from "@/components/dashboard/module-card";
import { ModuleEmptyState } from "@/components/dashboard/module-empty-state";
import { PageHeader } from "@/components/dashboard/page-header";

export default function TatuagemPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Módulo de serviço"
        title="Área de tatuagem"
        description="Esta área será usada para registrar atendimentos, valores, repasse do profissional e percentual da loja sobre os serviços."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <ModuleCard
          title="Atendimentos"
          description="Cada registro poderá guardar cliente, data, descrição do serviço e valor cobrado."
          accent="neutral"
        />

        <ModuleCard
          title="Percentual da loja"
          description="O sistema será preparado para aplicar o percentual de 10% da loja sobre os serviços de tatuagem."
          accent="purple"
        />

        <ModuleCard
          title="Leitura financeira"
          description="Essa área também servirá para acompanhar repasse, resultado e integração com o financeiro."
          accent="gold"
        />
      </div>

      <ModuleEmptyState
        title="Estrutura pronta para registrar os atendimentos"
        description="Esta página já está organizada como um módulo real da operação e preparada para receber a lógica do serviço."
        nextStep="Criar cadastro de atendimento, valor, profissional responsável e cálculo automático do percentual da loja."
      />
    </section>
  );
}