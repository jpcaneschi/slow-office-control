import { supabase } from "@/lib/supabase";
import {
  calcularAtivas,
  planejarSincronizacao,
  toISO,
  type DadosAlerta,
  type ExistenteNotificacao,
} from "@/lib/notificacoes-core";

export {
  LIMITE_ESTOQUE,
  calcularAtivas,
  planejarSincronizacao,
} from "@/lib/notificacoes-core";
export type {
  NovaNotificacao,
  DadosAlerta,
  ExistenteNotificacao,
  PlanoSincronizacao,
} from "@/lib/notificacoes-core";

export type Notificacao = {
  id: string;
  chave: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  href: string | null;
  lida: boolean;
  resolvida: boolean;
  resolvida_em: string | null;
  created_at: string;
};

/**
 * Recalcula as condições e concilia com o banco (insere novas, reativa e
 * resolve). O RLS garante que só mexemos nas notificações da própria empresa.
 */
export async function sincronizarNotificacoes(): Promise<void> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = toISO(hoje);
  const em7 = new Date(hoje);
  em7.setDate(em7.getDate() + 7);
  const em7ISO = toISO(em7);

  const [prodRes, varRes, promRes, condRes, evRes, cliRes, notRes] =
    await Promise.all([
      supabase.from("produtos").select("id, nome, estoque, status, tem_variacoes"),
      supabase.from("produto_variacoes").select("produto_id, estoque"),
      supabase.from("promissorias").select("id, status, data_vencimento"),
      supabase.from("condicionais").select("id, status, data_limite"),
      supabase.from("eventos").select("id, titulo, tipo, status, data"),
      supabase.from("clientes").select("id, nome, data_nascimento"),
      supabase
        .from("notificacoes")
        .select("chave, tipo, titulo, descricao, href, resolvida, lida"),
    ]);

  const dados: DadosAlerta = {
    produtos: (prodRes.data as DadosAlerta["produtos"]) || [],
    variacoes: (varRes.data as DadosAlerta["variacoes"]) || [],
    promissorias: (promRes.data as DadosAlerta["promissorias"]) || [],
    condicionais: (condRes.data as DadosAlerta["condicionais"]) || [],
    eventos: (evRes.data as DadosAlerta["eventos"]) || [],
    clientes: (cliRes.data as DadosAlerta["clientes"]) || [],
  };

  const ativas = calcularAtivas(dados, hojeISO, em7ISO);
  const existentes = (notRes.data as ExistenteNotificacao[]) || [];
  const { inserir, atualizar, reativar, resolver } = planejarSincronizacao(
    existentes,
    ativas
  );

  const trabalhos: PromiseLike<unknown>[] = [];

  if (inserir.length > 0) {
    // onConflict ignora corrida entre abas; a nova nasce ativa (resolvida=false).
    trabalhos.push(
      supabase
        .from("notificacoes")
        .upsert(inserir, { onConflict: "chave", ignoreDuplicates: true })
    );
  }
  if (atualizar.length > 0) {
    trabalhos.push(
      Promise.all(
        atualizar.map((notificacao) =>
          supabase
            .from("notificacoes")
            .update({
              tipo: notificacao.tipo,
              titulo: notificacao.titulo,
              descricao: notificacao.descricao,
              href: notificacao.href,
            })
            .eq("chave", notificacao.chave)
        )
      )
    );
  }
  if (reativar.length > 0) {
    trabalhos.push(
      supabase
        .from("notificacoes")
        .update({ resolvida: false, resolvida_em: null })
        .in("chave", reativar)
    );
  }
  if (resolver.length > 0) {
    trabalhos.push(
      supabase
        .from("notificacoes")
        .update({ resolvida: true, resolvida_em: new Date().toISOString() })
        .in("chave", resolver)
    );
  }

  await Promise.all(trabalhos);
}

export async function marcarComoLida(id: string) {
  await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
}

export async function marcarTodasComoLidas() {
  await supabase.from("notificacoes").update({ lida: true }).eq("lida", false);
}
