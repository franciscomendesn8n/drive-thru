/* =====================================================================
   Integração com ERP
   ---------------------------------------------------------------------
   A tela de agendamento chama apenas DT.ERP.buscarPedido(numero).
   Hoje responde com uma base simulada. Quando a API do ERP estiver
   disponível, basta mudar DT.ERP_CONFIG.modo para 'api' e ajustar
   DT.ERP.mapear() para o formato de retorno real.
   ===================================================================== */
window.DT = window.DT || {};

DT.ERP = (function () {
  const U = DT.util;

  const CLIENTES = [
    ['Silva Materiais', '(61) 98765-4321'], ['ABC Materiais', '(61) 99812-3344'], ['ConstruLar', '(61) 99301-7788'],
    ['João da Silva', '(61) 98123-4567'], ['Ferragem São Paulo', '(61) 3344-2211'], ['Construcenter', '(61) 99654-1200'],
    ['Mega Construção', '(61) 98877-6655'], ['XYZ Construção', '(61) 99100-2020'], ['Maria Oliveira', '(61) 98444-3030'],
    ['Edifica Engenharia', '(61) 3033-9090'], ['Reforma Já', '(61) 99555-8080'], ['Pedro Henrique Souza', '(61) 98222-1111'],
    ['Alvenaria Forte', '(61) 99777-0101'], ['Casa & Obra', '(61) 98989-2323'], ['Construtora Planalto', '(61) 3322-5566'],
    ['Lucas Ferreira', '(61) 99432-6543'], ['Obra Certa', '(61) 98011-7676'], ['Rafael Costa', '(61) 99876-5432']
  ];
  const VENDEDORES = ['João Silva', 'Fernanda Rocha', 'Marcelo Pires', 'Patrícia Lima'];
  const PAGAMENTOS = ['Boleto', 'PIX', 'Cartão de crédito', 'Cartão de débito', 'Faturado 28 dias', 'Dinheiro'];
  const PRODUTOS = [
    ['100231', 'Cimento CP-II 50kg', 'SC'], ['100874', 'Argamassa AC-II 20kg', 'SC'], ['200145', 'Tijolo cerâmico 8 furos (milheiro)', 'MIL'],
    ['100512', 'Areia média ensacada 20kg', 'SC'], ['300088', 'Vergalhão CA-50 10mm 12m', 'BR'], ['400310', 'Tubo PVC esgoto 100mm 6m', 'BR'],
    ['500027', 'Telha fibrocimento 2,44 x 1,10m', 'UN'], ['600741', 'Porcelanato 60x60 (cx 1,44m²)', 'CX'], ['600902', 'Rejunte flexível 1kg', 'UN'],
    ['700118', 'Tinta acrílica fosca 18L', 'LT'], ['200390', 'Bloco de concreto 14x19x39', 'UN'], ['100640', 'Cal hidratada 20kg', 'SC'],
    ['100733', 'Brita 1 ensacada 20kg', 'SC'], ['800050', "Caixa d'água 1000L", 'UN'], ['900211', 'Cabo flexível 2,5mm rolo 100m', 'RL']
  ];

  function gerarBase(dataBase) {
    const r = U.rng(20260926);
    const base = {};
    const pick = arr => arr[Math.floor(r() * arr.length)];

    function montar(numero, opts) {
      opts = opts || {};
      const linhas = opts.linhas || (2 + Math.floor(r() * 4));
      const itens = [];
      let valor = 0;
      if (opts.itens) {   // itens definidos (pedidos de apresentação)
        opts.itens.forEach(i => { itens.push({ sku: i[0], descricao: i[1], qtd: i[2], un: i[3] }); valor += i[2] * i[4]; });
      }
      const usados = new Set();
      for (let i = 0; i < (opts.itens ? 0 : linhas); i++) {
        let p = pick(PRODUTOS);
        while (usados.has(p[0])) p = pick(PRODUTOS);
        usados.add(p[0]);
        const qtd = 1 + Math.floor(r() * 20);
        const unit = 20 + Math.round(r() * 280);
        valor += qtd * unit;
        itens.push({ sku: p[0], descricao: p[1], qtd: qtd, un: p[2] });
      }
      const qtdItens = opts.qtdItens || itens.reduce((a, b) => a + b.qtd, 0);
      const cli = opts.cliente ? CLIENTES.find(c => c[0] === opts.cliente) || [opts.cliente, '(61) 90000-0000'] : pick(CLIENTES);
      const diasAtras = opts.diasAtras !== undefined ? opts.diasAtras : Math.floor(r() * 2);
      const hora = opts.hora || U.hmDeMinutos(7 * 60 + Math.floor(r() * 5 * 60));
      const faturado = opts.faturado !== undefined ? opts.faturado : r() > 0.55;
      return {
        numero: String(numero),
        notaFiscal: faturado ? String(opts.nf || (987000 + Math.floor(r() * 999))) : null,
        dataPedido: U.addDias(dataBase, -diasAtras),
        horaPedido: hora,
        cliente: cli[0],
        telefone: opts.telefone || cli[1],
        qtdItens: qtdItens,
        valor: opts.valor || Math.round(valor * 100) / 100,
        vendedor: opts.vendedor || pick(VENDEDORES),
        formaPagamento: opts.pagamento || pick(PAGAMENTOS),
        situacao: opts.situacao || (faturado ? 'Faturado' : 'Aprovado'),
        statusFaturamento: faturado ? 'Faturado' : 'Não faturado',
        statusPreparacao: 'Não iniciado',
        elegivelDriveThru: opts.elegivel !== undefined ? opts.elegivel : true,
        motivoInelegivel: opts.motivo || null,
        itens: itens
      };
    }

    // Pedidos usados pelos dados de demonstração (agenda do dia e histórico)
    for (let n = 123101; n <= 123160; n++) base[n] = montar(n);

    // Pedidos citados no escopo — livres para testar o agendamento
    base[123456] = montar(123456, { cliente: 'ABC Materiais', nf: 987654, qtdItens: 48, valor: 12850, pagamento: 'Boleto', situacao: 'Em faturamento', faturado: true, hora: '10:24', diasAtras: 0, linhas: 4 });
    base[123789] = montar(123789, { cliente: 'XYZ Construção', diasAtras: 0, faturado: false });
    base[124001] = montar(124001, { cliente: 'João da Silva', diasAtras: 0, pagamento: 'PIX', faturado: false, linhas: 2 });
    for (let n = 125300; n <= 125320; n++) base[n] = montar(n, { diasAtras: 0 });

    // Pedidos NÃO elegíveis (validação 8.5)
    base[125900] = montar(125900, { cliente: 'Construtora Planalto', diasAtras: 0, elegivel: false, motivo: 'Pedido com entrega programada (frete pela empresa).' });
    base[125901] = montar(125901, { cliente: 'Obra Certa', diasAtras: 0, elegivel: false, faturado: false, pagamento: 'Boleto', situacao: 'Aguardando aprovação', motivo: 'Pagamento pendente de aprovação financeira.' });
    base[125902] = montar(125902, { cliente: 'Reforma Já', diasAtras: 1, elegivel: false, situacao: 'Cancelado', motivo: 'Pedido cancelado no ERP.' });

    // Pedidos para a apresentação à diretoria (processo completo, do zero).
    // 130001 = pedido da apresentação · 130002 a 130013 = pedidos extras de teste
    const ITENS_APRESENTACAO = [
      ['100231', 'Cimento CP-II 50kg', 20, 'SC', 38.90],
      ['100874', 'Argamassa AC-II 20kg', 10, 'SC', 24.50],
      ['200145', 'Tijolo cerâmico 8 furos (milheiro)', 2, 'MIL', 890.00],
      ['100512', 'Areia média ensacada 20kg', 30, 'SC', 7.90],
      ['300088', 'Vergalhão CA-50 10mm 12m', 12, 'BR', 54.90]
    ];
    [130001, 130002, 130003].forEach(n => {
      base[n] = montar(n, { cliente: 'Jose Carlos Milito', telefone: '(61) 98765-2026', vendedor: 'Inácio Sardinha',
        pagamento: 'PIX', situacao: 'Aprovado', faturado: false, diasAtras: 0, itens: ITENS_APRESENTACAO });
      base[n].apresentacao = true;
    });

    // Mais 10 pedidos de teste (130004 a 130013): sem agendamento, data do pedido = hoje
    const TESTES = [
      [130004, 'Marcos Vinícius Andrade', '(61) 99812-4004', 'Inácio Sardinha', 'PIX', [['100231', 'Cimento CP-II 50kg', 15, 'SC', 38.90], ['100640', 'Cal hidratada 20kg', 10, 'SC', 16.90]]],
      [130005, 'Construtora Horizonte', '(61) 3344-4005', 'Inácio Sardinha', 'Boleto', [['200390', 'Bloco de concreto 14x19x39', 400, 'UN', 3.85], ['100733', 'Brita 1 ensacada 20kg', 40, 'SC', 8.40]]],
      [130006, 'Ana Paula Ferreira', '(61) 98123-4006', 'João Silva', 'Cartão de crédito', [['700118', 'Tinta acrílica fosca 18L', 3, 'LT', 389.00], ['600902', 'Rejunte flexível 1kg', 6, 'UN', 14.90]]],
      [130007, 'Reformas Bom Lar', '(61) 99555-4007', 'Fernanda Rocha', 'PIX', [['600741', 'Porcelanato 60x60 (cx 1,44m²)', 25, 'CX', 92.90], ['100874', 'Argamassa AC-II 20kg', 18, 'SC', 24.50]]],
      [130008, 'Carlos Eduardo Lima', '(61) 98444-4008', 'Inácio Sardinha', 'Dinheiro', [['400310', 'Tubo PVC esgoto 100mm 6m', 8, 'BR', 72.50], ['900211', 'Cabo flexível 2,5mm rolo 100m', 2, 'RL', 289.00]]],
      [130009, 'Edificar Engenharia', '(61) 3033-4009', 'João Silva', 'Faturado 28 dias', [['300088', 'Vergalhão CA-50 10mm 12m', 40, 'BR', 54.90], ['100231', 'Cimento CP-II 50kg', 60, 'SC', 38.90]]],
      [130010, 'Patrícia Souza', '(61) 99100-4010', 'Fernanda Rocha', 'Cartão de débito', [["800050", "Caixa d'água 1000L", 1, 'UN', 549.00], ['400310', 'Tubo PVC esgoto 100mm 6m', 3, 'BR', 72.50]]],
      [130011, 'Depósito Santa Rita', '(61) 99654-4011', 'Inácio Sardinha', 'Boleto', [['500027', 'Telha fibrocimento 2,44 x 1,10m', 30, 'UN', 64.90], ['100512', 'Areia média ensacada 20kg', 50, 'SC', 7.90]]],
      [130012, 'Roberto Nunes', '(61) 98989-4012', 'João Silva', 'PIX', [['200145', 'Tijolo cerâmico 8 furos (milheiro)', 3, 'MIL', 890.00], ['100231', 'Cimento CP-II 50kg', 25, 'SC', 38.90]]],
      [130013, 'Mestre Obras Acabamentos', '(61) 99777-4013', 'Fernanda Rocha', 'Cartão de crédito', [['600741', 'Porcelanato 60x60 (cx 1,44m²)', 12, 'CX', 92.90], ['600902', 'Rejunte flexível 1kg', 10, 'UN', 14.90], ['700118', 'Tinta acrílica fosca 18L', 2, 'LT', 389.00]]]
    ];
    TESTES.forEach(([n, cliente, telefone, vendedor, pagamento, itens]) => {
      base[n] = montar(n, { cliente, telefone, vendedor, pagamento, situacao: 'Aprovado', faturado: false, diasAtras: 0, itens });
      base[n].apresentacao = true;
    });
    return base;
  }

  let cache = null;

  /* Pedidos de apresentação: a venda aparece como feita hoje, 30 min antes da consulta */
  function atualizarApresentacao(p) {
    if (!p || !p.apresentacao) return p;
    const agora = new Date();
    const min = Math.max(7 * 60, agora.getHours() * 60 + agora.getMinutes() - 30);
    p.dataPedido = U.dataISO(agora);
    p.horaPedido = U.hmDeMinutos(Math.min(min, 23 * 60 + 59));
    delete p.apresentacao;
    return p;
  }
  function base() {
    if (!cache) cache = gerarBase(DT.db.meta().seedDate || U.dataISO());
    return cache;
  }

  /* Converte o retorno da API real para o formato interno.
     Ajuste os nomes dos campos conforme o ERP da empresa. */
  function mapear(api) {
    return {
      numero: String(api.numero || api.pedido || api.id),
      notaFiscal: api.notaFiscal || api.nf || null,
      dataPedido: (api.dataPedido || api.data || '').slice(0, 10),
      horaPedido: api.horaPedido || (api.dataPedido ? api.dataPedido.slice(11, 16) : ''),
      cliente: api.cliente && api.cliente.nome ? api.cliente.nome : api.cliente,
      telefone: api.telefone || (api.cliente && api.cliente.telefone) || '',
      qtdItens: api.qtdItens || (api.itens ? api.itens.reduce((a, b) => a + (b.qtd || 0), 0) : 0),
      valor: api.valor || api.valorTotal || null,
      vendedor: api.vendedor || '',
      formaPagamento: api.formaPagamento || '',
      situacao: api.situacao || api.status || '',
      statusFaturamento: api.statusFaturamento || (api.notaFiscal ? 'Faturado' : 'Não faturado'),
      statusPreparacao: api.statusPreparacao || 'Não iniciado',
      elegivelDriveThru: api.elegivelDriveThru !== false,
      motivoInelegivel: api.motivoInelegivel || null,
      itens: api.itens || []
    };
  }

  async function buscarPedido(numero) {
    numero = String(numero || '').replace(/\D/g, '');
    if (!numero) return null;
    /* Integração configurada em Configurações › Integração com o ERP (consulta feita pelo servidor) */
    if (DT.erpConfig && DT.erpConfig.emUso()) {
      const r = await DT.nuvem.erpConsultar(numero);
      return r && r.encontrado && r.pedido ? r.pedido : null;
    }
    if (DT.ERP_CONFIG.modo === 'api') {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), DT.ERP_CONFIG.timeoutMs);
      try {
        const resp = await fetch(DT.ERP_CONFIG.baseUrl + '/pedidos/' + encodeURIComponent(numero), { signal: ctrl.signal });
        if (resp.status === 404) return null;
        if (!resp.ok) throw new Error('ERP respondeu ' + resp.status);
        return mapear(await resp.json());
      } finally { clearTimeout(t); }
    }
    // modo simulado: pequena espera para parecer uma consulta real
    await new Promise(res => setTimeout(res, 250));
    let p = base()[numero];
    if (p) return atualizarApresentacao(JSON.parse(JSON.stringify(p)));
    // Somente na demonstração: pedidos do histórico gerado também são "encontrados"
    if (!p) {
      const hist = DT.db.agendamentos().find(a => a.pedido.numero === numero);
      if (hist) p = hist.pedido;
    }
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }

  function buscarPedidoSync(numero) {
    const p = base()[String(numero)];
    return p ? atualizarApresentacao(JSON.parse(JSON.stringify(p))) : null;
  }

  function funcionariosDemo() { return VENDEDORES; }
  function limparCache() { cache = null; }

  return { buscarPedido, buscarPedidoSync, mapear, funcionariosDemo, limparCache };
})();
