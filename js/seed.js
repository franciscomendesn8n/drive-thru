/* =====================================================================
   Dados iniciais e de demonstração
   Cria usuários, perfis, funcionários, parâmetros e um histórico
   realista (últimos 14 dias + agenda de hoje) para testar as telas.
   Em "Configurações" o administrador pode zerar tudo.
   ===================================================================== */
window.DT = window.DT || {};

DT.seed = (function () {
  const U = DT.util, S = DT.STATUS;

  const USUARIOS = [
    { login: 'admin', senha: 'admin123', nome: 'Francisco Mendes', perfil: 'admin', email: 'admin@empresa.com.br' },
    { login: 'joao.silva', senha: '123456', nome: 'João Silva', perfil: 'comercial', email: 'joao.silva@empresa.com.br' },
    { login: 'fernanda.rocha', senha: '123456', nome: 'Fernanda Rocha', perfil: 'comercial', email: 'fernanda.rocha@empresa.com.br' },
    { login: 'ana.santos', senha: '123456', nome: 'Ana Santos', perfil: 'logistica', email: 'ana.santos@empresa.com.br' },
    { login: 'carlos.lima', senha: '123456', nome: 'Carlos Lima', perfil: 'logistica', email: 'carlos.lima@empresa.com.br' },
    { login: 'gestor', senha: '123456', nome: 'Roberto Almeida', perfil: 'gestor', email: 'roberto.almeida@empresa.com.br' }
  ];
  const FUNCIONARIOS = [
    ['Ana Santos', 'Líder de expedição', 'Logística'], ['Carlos Lima', 'Conferente', 'Logística'],
    ['Pedro Alves', 'Operador de empilhadeira', 'Logística'], ['Marcos Rocha', 'Auxiliar de carga', 'Logística'],
    ['Juliana Costa', 'Conferente', 'Logística'], ['Diego Martins', 'Auxiliar de carga', 'Logística'],
    ['João Silva', 'Vendedor', 'Comercial'], ['Fernanda Rocha', 'Vendedora', 'Comercial'],
    ['Marcelo Pires', 'Vendedor', 'Comercial'], ['Patrícia Lima', 'Vendedora', 'Comercial']
  ];

  function usuariosIniciais() {
    return USUARIOS.map(u => ({
      id: U.uid('usr'), login: u.login, nome: u.nome, email: u.email, perfil: u.perfil,
      senhaHash: U.hashSenha(u.login, u.senha), ativo: true, criadoEm: new Date().toISOString(), ultimoAcesso: null
    }));
  }
  function funcionariosIniciais() {
    return FUNCIONARIOS.map((f, i) => ({ id: 'fun_' + (i + 1), nome: f[0], funcao: f[1], setor: f[2], ativo: true }));
  }

  function gerarAgendamentos(agora) {
    const r = U.rng(4242);
    const pick = a => a[Math.floor(r() * a.length)];
    const between = (a, b) => a + Math.floor(r() * (b - a + 1));
    const addMin = (d, m) => new Date(d.getTime() + m * 60000);
    const cfg = DT.DEFAULT_SETTINGS;
    const comerciais = ['João Silva', 'Fernanda Rocha', 'Marcelo Pires', 'Patrícia Lima'];
    const logistica = ['Ana Santos', 'Carlos Lima'];
    const carregadores = ['Carlos Lima', 'Pedro Alves', 'Marcos Rocha', 'Diego Martins', 'Juliana Costa'];
    const lista = [];
    const auditoria = [];

    function aud(ts, usuario, acao, ref, antes, depois) {
      auditoria.push({ id: U.uid('aud'), ts: ts.toISOString(), userId: null, usuario: usuario, acao: acao, entidade: 'Agendamento', referencia: ref, antes: antes, depois: depois });
    }

    function novo(pedido, data, hora, criadoEm) {
      const vendedor = pick(comerciais);
      const ag = {
        id: U.uid('ag'), pedido: pedido, data: data, hora: hora, responsavel: vendedor, observacao: '',
        status: S.AGENDADO, prep: S.AGENDADO, criadoEm: criadoEm.toISOString(), criadoPor: vendedor, criadoPorId: null,
        alteradoEm: criadoEm.toISOString(), alteradoPor: vendedor, reagendamentos: [], historico: [], etapas: {}
      };
      ag.historico.push({ ts: U.toDate(pedido.dataPedido, pedido.horaPedido).toISOString(), status: S.PEDIDO_REALIZADO, desc: 'Pedido realizado no ERP', usuario: pedido.vendedor });
      ag.historico.push({ ts: criadoEm.toISOString(), status: 'Agendamento criado', desc: 'Agendamento criado por ' + vendedor, usuario: vendedor });
      ag.historico.push({ ts: addMin(criadoEm, 1).toISOString(), status: S.AGENDADO, desc: 'Pedido agendado para ' + U.fmtData(data) + ' às ' + hora, usuario: vendedor });
      aud(criadoEm, vendedor, 'Criou agendamento', pedido.numero, null, U.fmtData(data) + ' ' + hora);
      return ag;
    }
    function ev(ag, ts, status, desc, usuario) {
      ag.historico.push({ ts: ts.toISOString(), status: status, desc: desc, usuario: usuario });
      ag.alteradoEm = ts.toISOString();
      ag.alteradoPor = usuario;
    }

    /* Avança a preparação até 'ate' (inclusive), sem ultrapassar 'limite' no tempo */
    function preparar(ag, inicio, ate, limite) {
      const etapas = DT.FLUXO_PREPARACAO.slice(1);
      const passos = [between(0, 5), between(15, 35), between(8, 15), between(3, 10), between(2, 6)];
      let t = inicio;
      const quem = pick(logistica);
      for (let i = 0; i < etapas.length; i++) {
        t = addMin(t, passos[i]);
        if (t > limite) break;
        const e = etapas[i];
        if (e === S.FATURADO && !ag.pedido.notaFiscal) {
          ag.pedido.notaFiscal = String(988000 + between(0, 999));
          ag.pedido.statusFaturamento = 'Faturado';
        }
        ag.prep = e;
        ag.status = e;
        ag.etapas[e] = { ts: t.toISOString(), usuario: quem, responsavel: null };
        const desc = e === S.EM_PREPARACAO ? 'Preparação iniciada' : e === S.PRONTO ? 'Pedido pronto para retirada' :
          e === S.FATURADO ? 'Pedido faturado — NF ' + ag.pedido.notaFiscal : 'Pedido ' + e.toLowerCase();
        ev(ag, t, e, desc, quem);
        if (e === ate) break;
      }
      return t;
    }

    function operar(ag, slot, alvo, agora, doca) {
      const quem = pick(logistica);
      let chegada = addMin(slot, between(-12, 20));
      if (chegada > agora) chegada = addMin(agora, -between(2, 6));
      ag.chegada = chegada.toISOString();
      ag.checkinPor = quem;
      ag.veiculo = { placa: 'ABC-' + between(1000, 9999), motorista: '', contato: ag.pedido.telefone };
      ag.status = S.CHEGOU;
      const dif = U.difMin(slot, chegada);
      ev(ag, chegada, S.CHEGOU, 'Cliente chegou' + (dif < 0 ? ' (' + U.fmtDuracao(-dif) + ' antes do horário)' : dif > 0 ? ' (' + U.fmtDuracao(dif) + ' após o horário)' : ' (no horário)'), quem);
      if (alvo === S.CHEGOU) return;
      let ini = addMin(chegada, between(1, 11));
      if (ini > agora) ini = addMin(agora, -1);
      ag.inicioAtendimento = ini.toISOString();
      ag.doca = doca;
      ag.respAtendimento = quem;
      ag.respCarregamento = pick(carregadores);
      ag.status = S.EM_ATENDIMENTO;
      ev(ag, ini, S.EM_ATENDIMENTO, 'Atendimento iniciado na ' + doca + ' por ' + quem, quem);
      if (alvo === S.EM_ATENDIMENTO) return;
      let car = addMin(ini, between(3, 8));
      if (car > agora) car = agora;
      ag.inicioCarregamento = car.toISOString();
      ag.status = S.CARREGANDO;
      ev(ag, car, S.CARREGANDO, 'Carregamento iniciado (' + ag.respCarregamento + ')', quem);
      if (alvo === S.CARREGANDO) return;
      const ent = addMin(car, between(7, 24));
      ag.entrega = ent.toISOString();
      ag.status = S.ENTREGUE;
      ev(ag, ent, S.ENTREGUE, 'Mercadoria entregue — responsável: ' + ag.respCarregamento, quem);
      const enc = addMin(ent, 1);
      ag.encerramento = enc.toISOString();
      ag.encerradoPor = quem;
      ag.status = S.CONCLUIDO;
      ev(ag, enc, S.CONCLUIDO, 'Retirada concluída por ' + quem, quem);
      aud(enc, quem, 'Finalizou retirada', ag.pedido.numero, 'Em atendimento', S.CONCLUIDO + ' — entregue ' + U.fmtHora(ag.entrega));
    }

    function naoCompareceu(ag, slot) {
      const t = addMin(slot, cfg.noShowMin + between(3, 12));
      ag.status = S.NAO_COMPARECEU;
      ev(ag, t, S.NAO_COMPARECEU, 'Cliente não compareceu no horário ' + ag.hora + '. Janela liberada.', pick(logistica));
    }
    function cancelar(ag, slot) {
      const motivos = ['Cliente optou por entrega em domicílio', 'Cliente desistiu da compra', 'Pedido alterado pelo cliente'];
      const t = addMin(new Date(ag.criadoEm), between(15, 90));
      const quem = ag.criadoPor, m = pick(motivos);
      ag.status = S.CANCELADO;
      ag.cancelamento = { ts: t.toISOString(), motivo: m, usuario: quem };
      ev(ag, t < slot ? t : addMin(slot, -30), S.CANCELADO, 'Cancelado. Motivo: ' + m + '. Janela ' + ag.hora + ' liberada.', quem);
      aud(t, quem, 'Cancelou agendamento', ag.pedido.numero, S.AGENDADO, 'Cancelado (' + m + ')');
    }
    function reagendamentoAnterior(ag, horaOriginal) {
      const t = addMin(new Date(ag.criadoEm), between(10, 50));
      const motivo = pick(['Cliente pediu outro horário', 'Veículo do cliente indisponível', 'Ajuste solicitado pelo cliente']);
      ag.reagendamentos.push({ ts: t.toISOString(), deData: ag.data, deHora: horaOriginal, paraData: ag.data, paraHora: ag.hora, motivo: motivo, usuario: ag.criadoPor });
      ev(ag, t, S.REAGENDADO, 'Reagendado de ' + U.fmtData(ag.data) + ' ' + horaOriginal + ' para ' + U.fmtData(ag.data) + ' ' + ag.hora + '. Motivo: ' + motivo, ag.criadoPor);
      aud(t, ag.criadoPor, 'Alterou retirada', ag.pedido.numero, U.fmtData(ag.data) + ' ' + horaOriginal, U.fmtData(ag.data) + ' ' + ag.hora + ' (' + motivo + ')');
    }

    function horarios(data) {
      const dia = U.toDate(data, '12:00').getDay();
      if (cfg.diasFuncionamento.indexOf(dia) < 0) return [];
      const out = [];
      for (let m = U.minutos(cfg.horaInicio); m + cfg.intervaloMin <= U.minutos(cfg.horaFim); m += cfg.intervaloMin) out.push(U.hmDeMinutos(m));
      return out;
    }

    const hoje = U.dataISO(agora);

    /* ---------- Histórico: últimos 14 dias ---------- */
    let numHist = 122001;
    for (let d = 14; d >= 1; d--) {
      const data = U.addDias(hoje, -d);
      const hs = horarios(data);
      let docaAlt = 0;
      hs.forEach(h => {
        if (r() > 0.78) return; // janela livre
        const tpl = DT.ERP.buscarPedidoSync(123101 + Math.floor(r() * 60));
        tpl.numero = String(numHist++);
        tpl.dataPedido = U.addDias(data, -between(0, 1));
        tpl.horaPedido = U.hmDeMinutos(between(7 * 60, 11 * 60));
        tpl.notaFiscal = null; tpl.statusFaturamento = 'Não faturado'; tpl.situacao = 'Aprovado';
        const slot = U.toDate(data, h);
        const criado = addMin(slot, -between(70, 60 * 20));
        const ag = novo(tpl, data, h, criado < U.toDate(tpl.dataPedido, tpl.horaPedido) ? addMin(U.toDate(tpl.dataPedido, tpl.horaPedido), 20) : criado);
        const x = r();
        if (x < 0.05) { cancelar(ag, slot); lista.push(ag); return; }
        if (r() < 0.08) {
          const hs2 = hs.filter(o => o < h);
          if (hs2.length) reagendamentoAnterior(ag, pick(hs2));
        }
        preparar(ag, addMin(slot, -between(80, 140)), S.PRONTO, slot);
        if (x < 0.12) { naoCompareceu(ag, slot); lista.push(ag); return; }
        operar(ag, slot, S.CONCLUIDO, addMin(slot, 600), cfg.docas[docaAlt++ % cfg.docas.length]);
        lista.push(ag);
      });
    }

    /* ---------- Agenda de hoje (estado conforme o horário atual) ---------- */
    let num = 123101;
    let docaAlt = 0;
    const hsHoje = horarios(hoje);
    let criticaFeita = false, noShowFeito = false, cancelFeito = false;
    hsHoje.forEach(h => {
      const slot = U.toDate(hoje, h);
      const m = (slot - agora) / 60000;
      if (m >= 30 && r() > 0.5) return;      // deixa janelas futuras livres para testar
      if (m < 30 && r() > 0.82) return;
      const pedido = DT.ERP.buscarPedidoSync(num++);
      let criado = addMin(slot, -between(65, 300));
      const tsPed = U.toDate(pedido.dataPedido, pedido.horaPedido);
      if (criado < tsPed) criado = addMin(tsPed, 15);
      if (criado > addMin(agora, -5)) criado = addMin(agora, -between(5, 40));
      const ag = novo(pedido, hoje, h, criado);
      const inicioPrep = addMin(slot, -between(90, 150)) < criado ? addMin(criado, 5) : addMin(slot, -between(90, 150));

      if (m < -60) {
        if (!cancelFeito) { cancelFeito = true; cancelar(ag, slot); }
        else {
          preparar(ag, inicioPrep, S.PRONTO, slot);
          if (!noShowFeito && m < -(cfg.noShowMin + 20)) { noShowFeito = true; naoCompareceu(ag, slot); }
          else operar(ag, slot, S.CONCLUIDO, agora, cfg.docas[docaAlt++ % cfg.docas.length]);
        }
      } else if (m < -35) {
        preparar(ag, inicioPrep, S.PRONTO, agora);
        operar(ag, slot, S.CARREGANDO, agora, cfg.docas[docaAlt++ % cfg.docas.length]);
      } else if (m < -15) {
        preparar(ag, inicioPrep, S.PRONTO, agora);
        operar(ag, slot, S.EM_ATENDIMENTO, agora, cfg.docas[docaAlt++ % cfg.docas.length]);
      } else if (m < 5) {
        preparar(ag, inicioPrep, S.PRONTO, agora);
        operar(ag, slot, S.CHEGOU, agora, null);
      } else if (m < 30) {
        if (!criticaFeita) { criticaFeita = true; preparar(ag, addMin(agora, -20), S.EM_PREPARACAO, agora); }
        else preparar(ag, inicioPrep, S.PRONTO, agora);
      } else if (m < 90) {
        preparar(ag, addMin(agora, -between(30, 60)), pick([S.SEPARADO, S.CONFERIDO, S.FATURADO]), agora);
      } else if (m < 180 && r() > 0.5) {
        preparar(ag, addMin(agora, -10), S.EM_PREPARACAO, agora);
      }
      lista.push(ag);
    });

    /* ---------- Próximos dias ---------- */
    for (let d = 1; d <= 2; d++) {
      const data = U.addDias(hoje, d);
      horarios(data).forEach(h => {
        if (r() > 0.3 || num > 123160) return;
        const pedido = DT.ERP.buscarPedidoSync(num++);
        const ag = novo(pedido, data, h, addMin(agora, -between(10, 240)));
        lista.push(ag);
      });
    }

    auditoria.sort((a, b) => a.ts < b.ts ? -1 : 1);
    return { lista, auditoria };
  }

  function executar(forcar) {
    if (!forcar && DT.db.meta().seeded) return false;
    DT.db.limparTudo();
    const agora = new Date();
    DT.db.set('meta', { seeded: true, seedDate: U.dataISO(agora), versao: DT.APP.versao });
    DT.ERP.limparCache();
    DT.db.set('settings', JSON.parse(JSON.stringify(DT.DEFAULT_SETTINGS)));
    DT.db.set('perfis', JSON.parse(JSON.stringify(DT.DEFAULT_PERFIS)));
    if (!DT.db.modoNuvem()) DT.db.set('users', usuariosIniciais());   // na nuvem, usuários ficam no servidor
    DT.db.set('funcionarios', funcionariosIniciais());
    const g = gerarAgendamentos(agora);
    DT.db.set('agendamentos', g.lista);
    DT.db.set('auditoria', g.auditoria);
    return true;
  }

  /* Base limpa (sem dados de demonstração), mantendo usuários e parâmetros */
  function limparOperacao() {
    DT.db.set('agendamentos', []);
    DT.db.set('auditoria', []);
  }

  return { executar, limparOperacao, USUARIOS };
})();
