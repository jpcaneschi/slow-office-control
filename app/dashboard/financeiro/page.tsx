import { FinanceiroSimplificado } from "@/components/dashboard/financeiro-simplificado";
import { CompraFornecedorForm } from "@/components/dashboard/compra-fornecedor-form";

export default function FinanceiroPage() {
  return (
    <div className="space-y-6">
      <FinanceiroSimplificado />
      <CompraFornecedorForm />
    </div>
  );
}
