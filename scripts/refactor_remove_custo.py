from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Padrão não encontrado: {label}")
    return text.replace(old, new)


def must_sub(text: str, pattern: str, repl: str, label: str, flags=0, minimum=1) -> str:
    out, n = re.subn(pattern, repl, text, flags=flags)
    if n < minimum:
        raise RuntimeError(f"Regex não encontrada: {label} (n={n})")
    return out


# ── Produtos ────────────────────────────────────────────────────────────────
p = read("app/dashboard/produtos/page.tsx")
p = p.replace("  custo: number | null;\n", "")
p = must_sub(p, r"\n// Markup padrão sugerido no cadastro: preço de venda = custo × MARKUP\.\nconst MARKUP = 2\.2;\n", "\n", "markup")
p = must_sub(p, r'^\s*const \[custo, setCusto\].*\n', '', 'state custo', re.M)
p = must_sub(p, r'^\s*const \[varCusto, setVarCusto\].*\n', '', 'state custo variacao', re.M)
p = p.replace(", preco, custo, estoque", ", preco, estoque")
p = p.replace(", preco, custo, estoque, status", ", preco, estoque, status")
p = must_sub(p, r'^\s*custo:\s*p\.custo,\n', '', 'persist custo produto', re.M)
p = must_sub(p, r'^\s*custo:\s*v\.custo,\n', '', 'persist custo variacao', re.M)
p = must_sub(p, r'^\s*const custoNum = varCusto \? Number\(varCusto\) : null;\n', '', 'custoNum variacao', re.M)
p = must_sub(p, r'\n\s*if \(custoNum !== null && \(!Number\.isFinite\(custoNum\) \|\| custoNum < 0\)\) \{\n\s*setErro\("Custo da variação não pode ser negativo\."\);\n\s*return;\n\s*\}', '', 'validacao custo variacao')
p = must_sub(p, r'^\s*custo:\s*custoNum,\n', '', 'insert custo variacao', re.M)
p = p.replace('    setVarCusto("");\n', '')
p = p.replace('    setCusto("");\n', '')
p = p.replace('    setCusto(produto.custo?.toString() || "");\n', '')
p = must_sub(p, r'^\s*const custoNumero = Number\(custo\);\n', '', 'custoNumero produto', re.M)
p = must_sub(p, r'\n\s*if \(Number\.isNaN\(custoNumero\) \|\| custo === "" \|\| custoNumero < 0\) \{\n\s*setErro\("Informe um custo válido \(não negativo\)\."\);\n\s*return;\n\s*\}', '', 'validacao custo produto')
p = must_sub(p, r'^\s*custo:\s*custoNumero,\n', '', 'save custo produto', re.M, minimum=2)
p = p.replace('                  Preço de venda\n', '                  Preço do produto\n')
p = must_sub(
    p,
    r'\n\s*\{parseFloat\(custo\) > 0 && \(\n.*?\n\s*\)\}',
    '',
    'sugestao markup UI',
    re.S,
)
p = must_sub(
    p,
    r'\n\s*<div>\n\s*<label className="mb-2 block text-sm text-\[#475569\]">Custo</label>\n.*?\n\s*</div>\n\n\s*<label className="flex cursor-pointer',
    '\n\n              <label className="flex cursor-pointer',
    'campo custo UI',
    re.S,
)
p = must_sub(
    p,
    r'\n\s*<input\n\s*type="number"\n\s*step="0\.01"\n\s*min="0"\n\s*value=\{varCusto\}.*?placeholder="Custo \(opcional\)".*?\n\s*/>',
    '',
    'campo custo variacao UI',
    re.S,
)
p = p.replace('                      "custo",\n', '')
p = must_sub(p, r'^\s*Number\(v\.custo \?\? p\.custo \?\? 0\),\n', '', 'csv custo variacao', re.M)
p = must_sub(p, r'^\s*Number\(p\.custo \|\| 0\),\n', '', 'csv custo produto', re.M)
p = must_sub(
    p,
    r'\n\s*<p className="text-sm text-\[#64748b\]">\n\s*Custo: R\$ \{Number\(produto\.custo \|\| 0\)\.toFixed\(2\)\}\n\s*</p>',
    '',
    'custo lista produto',
)
p = p.replace('                  O assistente aceita cabeçalhos comuns (produto, preço venda,\n', '                  O assistente aceita cabeçalhos comuns (produto, preço,\n')
if re.search(r'\bcusto\b|MARKUP|varCusto|setCusto|\.custo', p, re.I):
    matches = sorted(set(re.findall(r'.{0,45}(?:custo|MARKUP|varCusto|setCusto|\.custo).{0,65}', p, re.I)))[:10]
    raise RuntimeError(f"Produtos ainda contém custo legado: {matches}")
write("app/dashboard/produtos/page.tsx", p)

# ── Vendas ──────────────────────────────────────────────────────────────────
v = read("app/dashboard/vendas/page.tsx")
v = v.replace("  custo: number | null;\n", "")
v = v.replace("  custo_unitario: number;\n", "")
v = v.replace(", preco, custo, estoque", ", preco, estoque")
v = v.replace(", preco, custo, estoque, status", ", preco, estoque, status")
v = v.replace("// Produto com grade → exige variação; preço/custo/estoque vêm da variação.", "// Produto com grade → exige variação; preço e estoque vêm da variação.")
v = must_sub(v, r'\n\s*const custoUnit = variacao\n\s*\? Number\(variacao\.custo \?\? produto\.custo \?\? 0\)\n\s*: Number\(produto\.custo \|\| 0\);', '', 'custo item PDV')
v = must_sub(v, r'^\s*custo_unitario:\s*custoUnit,\n', '', 'rascunho custo PDV', re.M)
v = must_sub(v, r'^\s*custo_unitario:\s*item\.custo_unitario,\n', '', 'payload custo PDV', re.M)
if re.search(r'\bcusto\b|custo_unitario|\.custo', v, re.I):
    raise RuntimeError("Vendas ainda contém custo legado")
write("app/dashboard/vendas/page.tsx", v)

# ── Condicional ─────────────────────────────────────────────────────────────
c = read("app/dashboard/condicional/page.tsx")
c = c.replace("  custo: number | null;\n", "")
c = c.replace("  custo_unitario: number;\n", "")
c = c.replace(", preco, custo, estoque", ", preco, estoque")
c = c.replace(", preco, custo, estoque, status", ", preco, estoque, status")
c = must_sub(c, r'\n\s*const custoUnit = variacao\n\s*\? Number\(variacao\.custo \?\? produto\.custo \?\? 0\)\n\s*: Number\(produto\.custo \|\| 0\);', '', 'custo item condicional')
c = must_sub(c, r'^\s*custo_unitario:\s*custoUnit,\n', '', 'rascunho custo condicional', re.M)
c = must_sub(c, r'^\s*custo_unitario:\s*Number\(prod\?\.custo \|\| 0\),\n', '', 'payload custo conversao', re.M)
if re.search(r'\bcusto\b|custo_unitario|\.custo', c, re.I):
    raise RuntimeError("Condicional ainda contém custo legado")
write("app/dashboard/condicional/page.tsx", c)

# ── CSV importer ─────────────────────────────────────────────────────────────
i = read("lib/csv-importador.ts")
i = i.replace('  "custo",\n', '')
i = must_sub(i, r'\n\s*custo: "custo",\n\s*"preco custo": "custo",\n\s*"preco de custo": "custo",\n\s*"custo unitario": "custo",\n\s*pc: "custo",\n', '\n', 'sinonimos custo CSV')
i = i.replace("  custo: number | null;\n", "")
i = i.replace("  custo: number;\n", "")
i = must_sub(i, r'^\s*const custoProd = parseNumeroBR\(val\(primeira\.row, "custo"\)\) \?\? 0;\n', '', 'custoProd CSV', re.M)
i = must_sub(i, r'^\s*const custo = checarNum\(val\(primeira\.row, "custo"\), primeira\.linha, "Custo"\) \?\? 0;\n', '', 'custo simples CSV', re.M)
i = must_sub(i, r'^\s*const custo = checarNum\(\(row\[porCampo\.get\("custo"\) \?\? ""\] \?\? ""\)\.trim\(\), linha, "Custo"\);\n', '', 'custo variacao CSV', re.M)
i = must_sub(i, r'^\s*custo,\n', '', 'objeto custo CSV', re.M, minimum=2)
i = must_sub(i, r'^\s*custo:\s*custoProd,\n', '', 'produto custo CSV', re.M)
if re.search(r'\bcusto\b|\.custo', i, re.I):
    raise RuntimeError("CSV importer ainda contém custo legado")
write("lib/csv-importador.ts", i)

# ── Wizard de importação ────────────────────────────────────────────────────
w = read("components/dashboard/produto-import-wizard.tsx")
w = w.replace('{ v: "preco", l: "Preço de venda" },', '{ v: "preco", l: "Preço do produto" },')
w = w.replace('  { v: "custo", l: "Custo" },\n', '')
if re.search(r'\bcusto\b', w, re.I):
    raise RuntimeError("Wizard ainda contém custo")
write("components/dashboard/produto-import-wizard.tsx", w)

# ── Resultado da loja: despesa de fornecedor é a única saída de mercadoria ──
r = '''export type VendaResultado = {\n  id: string;\n  total: number | null;\n  status: string;\n  created_at: string;\n};\n\nexport type DespesaResultado = { valor: number | null; data: string };\nexport type ServicoResultado = {\n  valor: number | null;\n  percentual_loja: number | null;\n  data: string;\n};\n\n/**\n * Resultado operacional simples. Compras de mercadoria entram por `despesas`;\n * o preço do produto vendido nunca gera uma segunda saída automática.\n */\nexport function calcularResultadoLoja(\n  dados: {\n    vendas: VendaResultado[];\n    despesas: DespesaResultado[];\n    servicos?: ServicoResultado[];\n  },\n  filtros: {\n    vendaNoPeriodo: (venda: VendaResultado) => boolean;\n    dataNoPeriodo: (dataISO: string) => boolean;\n  }\n) {\n  const vendas = dados.vendas.filter(\n    (venda) => venda.status === "concluida" && filtros.vendaNoPeriodo(venda)\n  );\n  const receitaVendas = vendas.reduce(\n    (soma, venda) => soma + Number(venda.total || 0),\n    0\n  );\n  const despesas = dados.despesas\n    .filter((item) => filtros.dataNoPeriodo(item.data))\n    .reduce((soma, item) => soma + Number(item.valor || 0), 0);\n  const receitaServicos = (dados.servicos || [])\n    .filter((item) => filtros.dataNoPeriodo(item.data))\n    .reduce(\n      (soma, item) =>\n        soma + Number(item.valor || 0) * (Number(item.percentual_loja || 0) / 100),\n      0\n    );\n  const faturamento = receitaVendas + receitaServicos;\n  return {\n    faturamento,\n    receitaVendas,\n    receitaServicos,\n    despesas,\n    lucro: faturamento - despesas,\n  };\n}\n'''
write("lib/resultado-loja-utils.ts", r)

# ── Funcionários: não carrega itens/custo para calcular comissão ─────────────
f = read("app/dashboard/funcionarios/page.tsx")
f = must_sub(f, r'^type ItemCusto = .*\n', '', 'type ItemCusto', re.M)
f = must_sub(f, r'^\s*const \[itensCusto, setItensCusto\].*\n', '', 'state itens custo', re.M)
f = f.replace(', itensRes, despesasRes] = await Promise.all([', ', despesasRes] = await Promise.all([')
f = must_sub(f, r'^\s*supabase\.from\("venda_itens"\)\.select\("venda_id, quantidade, custo_unitario"\),\n', '', 'query itens custo', re.M)
f = f.replace(' || itensRes.error', '')
f = must_sub(f, r'^\s*setItensCusto\(.*\);\n', '', 'set itens custo', re.M)
f = f.replace('{ vendas, itens: itensCusto, despesas, servicos: atendServico }', '{ vendas, despesas, servicos: atendServico }')
f = f.replace(', itensCusto, despesas, janela]', ', despesas, janela]')
if re.search(r'\bcusto\b|itensCusto|custo_unitario', f, re.I):
    raise RuntimeError("Funcionários ainda contém custo legado")
write("app/dashboard/funcionarios/page.tsx", f)

# ── Financeiro: mensagem explícita de boletos/fornecedores ──────────────────
fin = read("components/dashboard/financeiro-simplificado.tsx")
fin = must_sub(
    fin,
    r'O custo unitário dos produtos continua salvo para estoque e análise, mas não é descontado novamente no Financeiro quando a compra já foi lançada como despesa\.',
    'Mercadoria é reconhecida no Financeiro pelos boletos e compras de fornecedor lançados como despesa. O preço do produto serve somente para registrar a venda ao cliente.',
    'nota financeiro',
)
write("components/dashboard/financeiro-simplificado.tsx", fin)

# ── Testes ──────────────────────────────────────────────────────────────────
t = read("tests/csv-importador.test.ts")
t = t.replace('expect(m["custo"].campo).toBe("custo");', 'expect(m["custo"].campo).toBe("ignorar");')
write("tests/csv-importador.test.ts", t)

write("tests/resultado-loja-utils.test.ts", '''import { describe, expect, it } from "vitest";\nimport { calcularResultadoLoja } from "@/lib/resultado-loja-utils";\n\ndescribe("calcularResultadoLoja", () => {\n  it("apura vendas e serviços menos despesas lançadas, sem segunda saída por peça", () => {\n    const resultado = calcularResultadoLoja(\n      {\n        vendas: [\n          { id: "v1", total: 1000, status: "concluida", created_at: "2026-08-01" },\n          { id: "v2", total: 500, status: "cancelada", created_at: "2026-08-01" },\n        ],\n        despesas: [{ valor: 300, data: "2026-08-05" }],\n        servicos: [{ valor: 200, percentual_loja: 20, data: "2026-08-08" }],\n      },\n      { vendaNoPeriodo: () => true, dataNoPeriodo: () => true }\n    );\n    expect(resultado.faturamento).toBe(1040);\n    expect(resultado.despesas).toBe(300);\n    expect(resultado.lucro).toBe(740);\n  });\n});\n''')

print("Refatoração concluída com sucesso.")
