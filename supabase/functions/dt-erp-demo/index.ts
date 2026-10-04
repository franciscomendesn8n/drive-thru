// Drive Thru — "ERP de demonstração"
// Simula a API de um ERP, num formato diferente do Drive Thru, para testar o assistente de integração.
//   GET /functions/v1/dt-erp-demo/pedidos/{numero}   com cabeçalho  X-API-Key: demo-condor-2026
// Pedidos: 220001 a 220010 (aprovados, retira), 140001 (cancelado), 140002 (entrega programada),
//          140003 (já faturado). Dados fictícios.
// status_separacao simula o WMS: avança uma etapa a cada 6 minutos (ciclo de 30 min) —
//   AGUARDANDO → EM SEPARACAO → SEPARADO → CONFERIDO → FATURADO.
// Cada item traz o código de barras (ean) e o endereço no CD (rua, prédio, nível, apartamento).
const CHAVE = "demo-condor-2026";
type Item = [string, string, number, string, number];
const P: Record<string, [string, string, string, string, Item[]]> = {
  "220001": ["Marcos Vinícius Andrade", "(61) 99812-4004", "Inácio Sardinha", "PIX", [["100231", "Cimento CP-II 50kg", 15, "SC", 38.9], ["100640", "Cal hidratada 20kg", 10, "SC", 16.9]]],
  "220002": ["Construtora Horizonte", "(61) 3344-4005", "Inácio Sardinha", "BOLETO", [["200390", "Bloco de concreto 14x19x39", 400, "UN", 3.85], ["100733", "Brita 1 ensacada 20kg", 40, "SC", 8.4]]],
  "220003": ["Ana Paula Ferreira", "(61) 98123-4006", "João Silva", "CARTAO CREDITO", [["700118", "Tinta acrílica fosca 18L", 3, "LT", 389], ["600902", "Rejunte flexível 1kg", 6, "UN", 14.9]]],
  "220004": ["Reformas Bom Lar", "(61) 99555-4007", "Fernanda Rocha", "PIX", [["600741", "Porcelanato 60x60 (cx 1,44m²)", 25, "CX", 92.9], ["100874", "Argamassa AC-II 20kg", 18, "SC", 24.5]]],
  "220005": ["Carlos Eduardo Lima", "(61) 98444-4008", "Inácio Sardinha", "DINHEIRO", [["400310", "Tubo PVC esgoto 100mm 6m", 8, "BR", 72.5], ["900211", "Cabo flexível 2,5mm rolo 100m", 2, "RL", 289]]],
  "220006": ["Edificar Engenharia", "(61) 3033-4009", "João Silva", "FATURADO 28 DIAS", [["300088", "Vergalhão CA-50 10mm 12m", 40, "BR", 54.9], ["100231", "Cimento CP-II 50kg", 60, "SC", 38.9]]],
  "220007": ["Patrícia Souza", "(61) 99100-4010", "Fernanda Rocha", "CARTAO DEBITO", [["800050", "Caixa d'água 1000L", 1, "UN", 549], ["400310", "Tubo PVC esgoto 100mm 6m", 3, "BR", 72.5]]],
  "220008": ["Depósito Santa Rita", "(61) 99654-4011", "Inácio Sardinha", "BOLETO", [["500027", "Telha fibrocimento 2,44 x 1,10m", 30, "UN", 64.9], ["100512", "Areia média ensacada 20kg", 50, "SC", 7.9]]],
  "220009": ["Roberto Nunes", "(61) 98989-4012", "João Silva", "PIX", [["200145", "Tijolo cerâmico 8 furos (milheiro)", 3, "MIL", 890], ["100231", "Cimento CP-II 50kg", 25, "SC", 38.9]]],
  "220010": ["Mestre Obras Acabamentos", "(61) 99777-4013", "Fernanda Rocha", "CARTAO CREDITO", [["600741", "Porcelanato 60x60 (cx 1,44m²)", 12, "CX", 92.9], ["600902", "Rejunte flexível 1kg", 10, "UN", 14.9], ["700118", "Tinta acrílica fosca 18L", 2, "LT", 389]]],
  "140001": ["Obra Certa", "(61) 98011-4101", "Fernanda Rocha", "BOLETO", [["100231", "Cimento CP-II 50kg", 10, "SC", 38.9]]],
  "140002": ["Construtora Planalto", "(61) 3322-4102", "João Silva", "BOLETO", [["300088", "Vergalhão CA-50 10mm 12m", 80, "BR", 54.9]]],
  "140003": ["ABC Materiais", "(61) 99812-4103", "Inácio Sardinha", "PIX", [["100512", "Areia média ensacada 20kg", 20, "SC", 7.9], ["100733", "Brita 1 ensacada 20kg", 20, "SC", 8.4]]],
};
const ETAPAS = ["AGUARDANDO", "EM SEPARACAO", "SEPARADO", "CONFERIDO", "FATURADO"];
function eanDe(sku: string) {
  const base = ("789" + sku.replace(/\D/g, "").padStart(9, "0")).slice(-12).padStart(12, "0");
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(base[i]) * (i % 2 ? 3 : 1);
  return base + ((10 - soma % 10) % 10);
}
function enderecoDe(sku: string) {
  const d = sku.replace(/\D/g, "").padStart(6, "0").slice(-6);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return { rua: p2(Math.max(1, Number(d[0]) * 2 - (Number(d[5]) % 2))), predio: String(Number(d.slice(1, 4)) % 40 + 1).padStart(3, "0"),
    nivel: p2(Number(d[4]) % 4 + 1), apto: p2(Number(d[5]) % 3 + 1) };
}
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "x-api-key, content-type", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
  if (req.headers.get("x-api-key") !== CHAVE) return json({ error: "unauthorized" }, 401);
  const num = (new URL(req.url).pathname.match(/pedidos\/(\d+)/) || [])[1] || new URL(req.url).searchParams.get("numero") || "";
  const p = P[num];
  if (!p) return json({ error: "pedido nao encontrado" }, 404);
  // horário de emissão: 30 min antes da consulta (horário de Brasília)
  const emissao = new Date(Date.now() - 30 * 60000 - 3 * 3600000).toISOString().slice(0, 19) + "-03:00";
  const situacao = num === "140001" ? "CANCELADO" : num === "140003" ? "FATURADO" : "APROVADO";
  const brt = new Date(Date.now() - 3 * 3600000);
  const minuto = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  const etapa = num === "140001" ? 0 : num === "140003" ? 4 : Math.floor(((minuto + Number(num.slice(-2)) * 7) % 30) / 6);
  const nf = num === "140003" ? "456789" : etapa === 4 ? "9" + num.slice(-5) : null;
  return json({
    success: true,
    data: {
      nr_pedido: num, dt_emissao: emissao, filial: "CD-01",
      situacao, tipo_entrega: num === "140002" ? "ENTREGA" : "RETIRA",
      status_separacao: ETAPAS[etapa],
      nota_fiscal: nf,
      condicao_pagamento: p[3],
      valor_total: Math.round(p[4].reduce((a, i) => a + i[2] * i[4], 0) * 100) / 100,
      vendedor: { codigo: "V" + (p[2].length * 7), nome: p[2] },
      cliente: { codigo: "C" + num.slice(-3), razao_social: p[0], telefone: p[1] },
      itens: p[4].map((i, k) => ({ seq: k + 1, cod_produto: i[0], descricao: i[1], qtde: i[2], unidade: i[3], vl_unitario: i[4], ean: eanDe(i[0]), endereco: enderecoDe(i[0]) })),
    },
  });
});
