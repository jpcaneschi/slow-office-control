export function linkConvite(origem: string, convite: { id: string; email: string }) {
  const url = new URL("/login", origem);
  url.searchParams.set("convite", convite.id);
  url.searchParams.set("novo", "1");
  url.searchParams.set("email", convite.email);
  return url.toString();
}
export function mensagemConvite(link: string) {
  return `Você foi convidado(a) para a equipe da loja no Nexo. Abra o link, crie sua senha com o e-mail convidado e confirme seu e-mail, se solicitado. Se já tem conta, escolha Entrar. Suas vendas entram diretamente no sistema da loja.\n\n${link}`;
}
