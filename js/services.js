/* =====================================================================
   Regras de negócio do Drive Thru
   (autenticação, janelas, validações, status, alertas e indicadores)
   ===================================================================== */
window.DT = window.DT || {};

/* ---------------------------- Autenticação --------------------------- */
DT.auth = (function () {
  const U = DT.util;

  function usuarioAtual() {
    const s = DT.session.get();
    if (!s) return null;
    const u = DT.db.users().find(x => x.id === s.userId && x.ativo);
    if (!u) return null;
    const perfis = DT.db.perfis();
    const perfil = perfis[u.perfil] || { nome: u.perfil, permissoes: [] };
    return Object.assign({}, u, { perfilNome: perfil.nome, permissoes: perfil.permissoes });
  }
  function pode(perm) {
    const u = usuarioAtual();
    return !!(u && u.permissoes.indexOf(perm) >= 0);
  }
  /* Retorna sempre uma Promise ({ ok, erro }) para funcionar nos dois modos */
  function login(login, senha) {
    if (DT.db.modoNuvem()) {
      return DT.nuvem.login(login, senha).then(r => {
        if (r.ok) DT.audit.registrar('Login no sistema', 'Sessão', String(login).trim().toLowerCase(), null, null);
        return r;
      });
    }
    login = String(login || '').trim().toLowerCase();
    const u = DT.db.users().find(x => x.login.toLowerCase() === login);
    if (!u || u.senhaHash !== U.hashSenha(login, senha)) {
      return Promise.resolve({ ok: false, erro: 'Usuário ou senha incorretos.' });
    }
    if (!u.ativo) return Promise.resolve({ ok: false, erro: 'Usuário inativo. Procure o administrador.' });
    DT.session.set(u.id);
    const users = DT.db.users();
    const i = users.findIndex(x => x.id === u.id);
    users[i].ultimoAcesso = new Date().toISOString();
    DT.db.set('users', users);
    DT.audit.registrar('Login no sistema', 'Sessão', u.login, null, null);
    return Promise.resolve({ ok: true });
  }
  /* Troca da senha do próprio usuário, nos dois modos */
  function trocarMinhaSenha(atual, nova) {
    const erro = U.validarSenha(nova);
    if (erro) return Promise.resolve({ ok: false, erro: erro });
    const u = usuarioAtual();
    if (!u) return Promise.resolve({ ok: false, erro: 'Sessão encerrada. Entre novamente.' });
    const auditar = r => { if (r.ok) DT.audit.registrar('Trocou a própria senha', 'Usuário', u.login, null, null); return r; };
    if (DT.db.modoNuvem()) return DT.nuvem.trocarMinhaSenha(atual, nova).then(auditar);
    const users = DT.db.users();
    const i = users.findIndex(x => x.id === u.id);
    if (users[i].senhaHash !== U.hashSenha(u.login, atual)) return Promise.resolve({ ok: false, erro: 'A senha atual está incorreta.' });
    if (atual === nova) return Promise.resolve({ ok: false, erro: 'A nova senha precisa ser diferente da atual.' });
    users[i].senhaHash = U.hashSenha(u.login, nova);
    DT.db.set('users', users);
    return Promise.resolve(auditar({ ok: true }));
  }
  function logout() {
    DT.audit.registrar('Saiu do sistema', 'Sessão', (usuarioAtual() || {}).login, null, null);
    if (DT.db.modoNuvem()) return DT.nuvem.logout();
    DT.session.clear();
    return Promise.resolve();
  }
  return { usuarioAtual, pode, login, logout, trocarMinhaSenha };
})();

/* ------------------------------ Auditoria ---------------------------- */
DT.audit = {
  registrar(acao, entidade, referencia, antes, depois) {
    const u = DT.auth.usuarioAtual();
    DT.db.registrarAuditoria({
      id: DT.util.uid('aud'),
      ts: new Date().toISOString(),
      userId: u ? u.id : null,
      usuario: u ? u.nome : 'Sistema',
      acao: acao,
      entidade: entidade,
      referencia: referencia || '',
      antes: antes === undefined ? null : antes,
      depois: depois === undefined ? null : depois
    });
  }
};

/* ---------------------------- Janelas/agenda -------------------------- */
DT.agenda = (function () {
  const U = DT.util;

  function horariosDoDia(data) {
    const cfg = DT.db.settings();
    const dia = U.toDate(data, '12:00').getDay();
    if (cfg.diasFuncionamento.indexOf(dia) < 0) return [];
    const ini = U.minutos(cfg.horaInicio), fim = U.minutos(cfg.horaFim), passo = Math.max(5, Number(cfg.intervaloMin) || 30);
    const out = [];
    for (let m = ini; m + passo <= fim; m += passo) out.push(U.hmDeMinutos(m));
    return out;
  }
  function ocupantes(data, hora, ignorarId) {
    return DT.db.agendamentos().filter(a => a.data === data && a.hora === hora && a.id !== ignorarId &&
      DT.STATUS_GRUPOS.ocupamJanela.indexOf(a.status) >= 0);
  }
  function capacidade() { return Math.max(1, Number(DT.db.settings().pedidosPorJanela) || 1); }

  /* Momento mínimo permitido para a retirada (agora + antecedência) */
  function minimoPermitido() {
    const cfg = DT.db.settings();
    return new Date(Date.now() + (Number(cfg.antecedenciaMinMin) || 60) * 60000);
  }
  function respeitaAntecedencia(data, hora) {
    return U.toDate(data, hora) >= minimoPermitido();
  }

  /* Visão completa de um dia: usada pela agenda visual, dashboard e seletor de horários */
  function mapaDia(data, ignorarId) {
    const cap = capacidade();
    return horariosDoDia(data).map(h => {
      const oc = ocupantes(data, h, ignorarId);
      return {
        hora: h,
        capacidade: cap,
        ocupados: oc.length,
        agendamentos: DT.db.agendamentos().filter(a => a.data === data && a.hora === h).sort((a, b) => a.criadoEm < b.criadoEm ? -1 : 1),
        lotada: oc.length >= cap,
        foraAntecedencia: !respeitaAntecedencia(data, h)
      };
    });
  }

  function proximosDisponiveis(aPartirData, aPartirHora, qtd, ignorarId) {
    qtd = qtd || 6;
    const cfg = DT.db.settings();
    const res = [];
    let data = aPartirData;
    for (let d = 0; d <= cfg.diasAgendaAFrente && res.length < qtd; d++) {
      mapaDia(data, ignorarId).forEach(j => {
        if (res.length >= qtd) return;
        if (d === 0 && aPartirHora && j.hora < aPartirHora) return;
        if (!j.lotada && !j.foraAntecedencia) res.push({ data: data, hora: j.hora, livres: j.capacidade - j.ocupados });
      });
      data = U.addDias(data, 1);
    }
    return res;
  }

  function diasDisponiveis() {
    const cfg = DT.db.settings();
    const out = [];
    let data = U.dataISO();
    for (let i = 0; i <= cfg.diasAgendaAFrente; i++) {
      if (horariosDoDia(data).length) out.push(data);
      data = U.addDias(data, 1);
    }
    return out;
  }

  return { horariosDoDia, ocupantes, capacidade, minimoPermitido, respeitaAntecedencia, mapaDia, proximosDisponiveis, diasDisponiveis };
})();

/* --------------------------- Agendamentos ---------------------------- */
DT.ag = (function () {
  const U = DT.util, S = DT.STATUS, G = DT.STATUS_GRUPOS;

  function user() { return DT.auth.usuarioAtual() || { id: null, nome: 'Sistema' }; }

  function evento(ag, status, desc, ts) {
    ag.historico = ag.historico || [];
    ag.historico.push({ ts: ts || new Date().toISOString(), status: status, desc: desc, usuario: user().nome });
  }
  function tocar(ag) {
    ag.alteradoEm = new Date().toISOString();
    ag.alteradoPor = user().nome;
  }

  function ativoDoPedido(numero) {
    return DT.db.agendamentos().find(a => a.pedido.numero === String(numero) &&
      a.status !== S.CANCELADO && a.status !== S.NAO_COMPARECEU) || null;
  }
  function doPedido(numero) {
    return DT.db.agendamentos().filter(a => a.pedido.numero === String(numero))
      .sort((a, b) => a.criadoEm < b.criadoEm ? 1 : -1);
  }

  /* Elegibilidade (validação 8.5) */
  function elegibilidade(pedido) {
    const cfg = DT.db.settings();
    if (!pedido.elegivelDriveThru) return { ok: false, motivo: pedido.motivoInelegivel || 'Pedido não habilitado para retirada pelo Drive Thru.' };
    if (cfg.limiteItens > 0 && pedido.qtdItens > cfg.limiteItens) {
      return { ok: false, motivo: 'Pedido com ' + pedido.qtdItens + ' itens. O limite do Drive Thru é de ' + cfg.limiteItens + ' itens.' };
    }
    return { ok: true };
  }

  /* Validações de horário (8.3 e 8.4) */
  function validarHorario(data, hora, ignorarId) {
    if (!data || !hora) return { ok: false, erro: 'Escolha a data e o horário da retirada.' };
    if (DT.agenda.horariosDoDia(data).indexOf(hora) < 0) {
      return { ok: false, erro: 'Horário fora do funcionamento do Drive Thru.', sugestoes: DT.agenda.proximosDisponiveis(data, null, 6, ignorarId) };
    }
    if (!DT.agenda.respeitaAntecedencia(data, hora)) {
      return { ok: false, erro: 'A retirada deve ser agendada com antecedência mínima de 1 hora.', sugestoes: DT.agenda.proximosDisponiveis(U.dataISO(), null, 6, ignorarId) };
    }
    if (DT.agenda.ocupantes(data, hora, ignorarId).length >= DT.agenda.capacidade()) {
      return { ok: false, erro: 'Horário indisponível. Selecione outra janela.', sugestoes: DT.agenda.proximosDisponiveis(data, hora, 6, ignorarId) };
    }
    return { ok: true };
  }

  function criar(pedido, dados) {
    if (!DT.auth.pode('agendamento.criar')) return { ok: false, erro: 'Seu perfil não pode criar agendamentos.' };
    if (!pedido) return { ok: false, erro: 'Pedido não localizado. Verifique o número informado.' };
    const el = elegibilidade(pedido);
    if (!el.ok) return { ok: false, erro: 'Pedido não habilitado para retirada pelo Drive Thru. ' + el.motivo };
    const existente = ativoDoPedido(pedido.numero);
    if (existente) return { ok: false, erro: 'Este pedido já possui uma retirada agendada.', existente: existente };
    const v = validarHorario(dados.data, dados.hora);
    if (!v.ok) return v;
    if (!dados.responsavel) return { ok: false, erro: 'Informe o responsável pelo agendamento.' };

    const agora = new Date().toISOString();
    const u = user();
    const ag = {
      id: U.uid('ag'),
      pedido: pedido,
      data: dados.data,
      hora: dados.hora,
      responsavel: dados.responsavel,
      observacao: dados.observacao || '',
      status: S.AGENDADO,
      prep: S.AGENDADO,
      criadoEm: agora,
      criadoPor: u.nome,
      criadoPorId: u.id,
      alteradoEm: agora,
      alteradoPor: u.nome,
      reagendamentos: [],
      historico: []
    };
    const tsPedido = U.toDate(pedido.dataPedido, pedido.horaPedido).toISOString();
    ag.historico.push({ ts: tsPedido, status: S.PEDIDO_REALIZADO, desc: 'Pedido realizado no ERP', usuario: pedido.vendedor || 'ERP' });
    evento(ag, 'Agendamento criado', 'Agendamento criado por ' + u.nome);
    evento(ag, S.AGENDADO, 'Pedido agendado para ' + U.fmtData(ag.data) + ' às ' + ag.hora);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Criou agendamento', 'Agendamento', pedido.numero, null, U.fmtData(ag.data) + ' ' + ag.hora);
    if (DT.avisos) DT.avisos.evento(ag, 'confirmacao');
    return { ok: true, ag: ag };
  }

  function reagendar(id, data, hora, motivo) {
    if (!DT.auth.pode('agendamento.alterar')) return { ok: false, erro: 'Seu perfil não pode alterar agendamentos.' };
    const ag = DT.db.agendamentoPorId(id);
    if (!ag) return { ok: false, erro: 'Agendamento não encontrado.' };
    const permitidos = G.ativosPreChegada.concat([S.NAO_COMPARECEU]);
    if (permitidos.indexOf(ag.status) < 0) return { ok: false, erro: 'Não é possível reagendar um pedido com status "' + ag.status + '".' };
    if (!motivo || !motivo.trim()) return { ok: false, erro: 'Informe o motivo do reagendamento.' };
    if (ag.data === data && ag.hora === hora) return { ok: false, erro: 'Escolha um horário diferente do atual.' };
    const v = validarHorario(data, hora, ag.id);
    if (!v.ok) return v;
    const antes = U.fmtData(ag.data) + ' ' + ag.hora;
    ag.reagendamentos.push({ ts: new Date().toISOString(), deData: ag.data, deHora: ag.hora, paraData: data, paraHora: hora, motivo: motivo, usuario: user().nome });
    ag.data = data; ag.hora = hora;
    if (ag.status === S.AGENDADO || ag.status === S.NAO_COMPARECEU) ag.status = S.REAGENDADO;
    evento(ag, S.REAGENDADO, 'Reagendado de ' + antes + ' para ' + U.fmtData(data) + ' ' + hora + '. Motivo: ' + motivo);
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Alterou retirada', 'Agendamento', ag.pedido.numero, antes, U.fmtData(data) + ' ' + hora + ' (' + motivo + ')');
    return { ok: true, ag: ag };
  }

  function cancelar(id, motivo) {
    if (!DT.auth.pode('agendamento.alterar')) return { ok: false, erro: 'Seu perfil não pode cancelar agendamentos.' };
    const ag = DT.db.agendamentoPorId(id);
    if (!ag) return { ok: false, erro: 'Agendamento não encontrado.' };
    if (G.ativosPreChegada.indexOf(ag.status) < 0) return { ok: false, erro: 'Só é possível cancelar antes da chegada do cliente.' };
    if (!motivo || !motivo.trim()) return { ok: false, erro: 'Informe o motivo do cancelamento.' };
    const antes = ag.status;
    ag.status = S.CANCELADO;
    ag.cancelamento = { ts: new Date().toISOString(), motivo: motivo, usuario: user().nome };
    evento(ag, S.CANCELADO, 'Cancelado. Motivo: ' + motivo + '. Janela ' + ag.hora + ' liberada.');
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Cancelou agendamento', 'Agendamento', ag.pedido.numero, antes, 'Cancelado (' + motivo + ')');
    return { ok: true, ag: ag };
  }

  /* ---- Preparação (Logística) ---- */
  function prepAtual(ag) { return ag.prep === S.REAGENDADO ? S.AGENDADO : (ag.prep || S.AGENDADO); }
  function proximaEtapa(ag) {
    const i = DT.FLUXO_PREPARACAO.indexOf(prepAtual(ag));
    return i >= 0 && i < DT.FLUXO_PREPARACAO.length - 1 ? DT.FLUXO_PREPARACAO[i + 1] : null;
  }
  function etapaAnterior(ag) {
    const i = DT.FLUXO_PREPARACAO.indexOf(prepAtual(ag));
    return i > 0 ? DT.FLUXO_PREPARACAO[i - 1] : null;
  }
  function aplicarPrep(ag, etapa) {
    ag.prep = etapa;
    // Antes da chegada, o status operacional acompanha a preparação
    if (G.ativosPreChegada.indexOf(ag.status) >= 0 && ag.status !== S.A_CAMINHO) ag.status = etapa;
  }
  /* opts.origem = 'coletor' (Modo coletor, permissão própria); sem origem = tela Preparação */
  function avancarPreparacao(id, extra, opts) {
    opts = opts || {};
    const perm = opts.origem === 'coletor' ? 'coletor.operar' : 'preparacao.alterar';
    if (!DT.auth.pode(perm)) return { ok: false, erro: opts.origem === 'coletor' ? 'Seu perfil não pode operar o coletor.' : 'Seu perfil não pode alterar a preparação.' };
    const ag = DT.db.agendamentoPorId(id);
    if (!ag) return { ok: false, erro: 'Agendamento não encontrado.' };
    if (G.finalizados.indexOf(ag.status) >= 0) return { ok: false, erro: 'Pedido já finalizado.' };
    const prox = proximaEtapa(ag);
    if (!prox) return { ok: false, erro: 'O pedido já está pronto para retirada.' };
    if (DT.separacao) {
      const quem = DT.separacao.quemRegistra(prox);
      if (!opts.origem && quem) return { ok: false, erro: 'Neste modo de trabalho, a etapa "' + prox + '" é registrada ' + quem + '.' };
      if (opts.origem === 'coletor' && quem !== 'pelo coletor') return { ok: false, erro: 'A etapa "' + prox + '" não é registrada pelo coletor.' };
    }
    const antes = prepAtual(ag);
    if (prox === S.FATURADO) {
      const nf = (extra && extra.notaFiscal) || ag.pedido.notaFiscal;
      if (!nf) return { ok: false, erro: 'Informe o número da nota fiscal para registrar o faturamento.', precisaNF: true };
      ag.pedido.notaFiscal = String(nf);
      ag.pedido.statusFaturamento = 'Faturado';
    }
    aplicarPrep(ag, prox);
    ag.etapas = ag.etapas || {};
    ag.etapas[prox] = { ts: new Date().toISOString(), usuario: user().nome, responsavel: extra && extra.responsavel || null, origem: opts.origem || 'manual' };
    let desc = 'Pedido ' + prox.toLowerCase();
    if (prox === S.EM_PREPARACAO) desc = 'Preparação iniciada';
    if (prox === S.PRONTO) desc = 'Pedido pronto para retirada';
    if (prox === S.FATURADO) desc = 'Pedido faturado — NF ' + ag.pedido.notaFiscal;
    if (extra && extra.responsavel) desc += ' (' + extra.responsavel + ')';
    if (opts.origem === 'coletor') desc += ' — coletor' + (extra && extra.obs ? ' (' + extra.obs + ')' : '');
    evento(ag, prox, desc);
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar(opts.origem === 'coletor' ? 'Alterou preparação (coletor)' : 'Alterou preparação', 'Agendamento', ag.pedido.numero, antes, prox + (extra && extra.obs ? ' — ' + extra.obs : ''));
    if (prox === S.PRONTO && DT.avisos) DT.avisos.evento(ag, 'pronto');
    return { ok: true, ag: ag };
  }
  function voltarPreparacao(id, motivo, opts) {
    opts = opts || {};
    if (!DT.auth.pode(opts.origem === 'coletor' ? 'coletor.operar' : 'preparacao.alterar')) return { ok: false, erro: 'Seu perfil não pode alterar a preparação.' };
    const ag = DT.db.agendamentoPorId(id);
    const ant = ag && etapaAnterior(ag);
    if (!ant) return { ok: false, erro: 'Não há etapa anterior.' };
    if (!motivo || !motivo.trim()) return { ok: false, erro: 'Informe o motivo da correção.' };
    const antes = prepAtual(ag);
    aplicarPrep(ag, ant);
    // Modo coletor: a contagem da fase desfeita recomeça
    if (ag.coleta) {
      if (ant === S.AGENDADO || ant === S.EM_PREPARACAO) { ag.coleta.fase = 'separacao'; ag.coleta.separacao = {}; ag.coleta.conferencia = {}; }
      else if (ant === S.SEPARADO) { ag.coleta.fase = 'conferencia'; ag.coleta.conferencia = {}; }
    }
    evento(ag, ant, 'Etapa corrigida de "' + antes + '" para "' + ant + '". Motivo: ' + motivo);
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Corrigiu etapa de preparação', 'Agendamento', ag.pedido.numero, antes, ant + ' (' + motivo + ')');
    return { ok: true, ag: ag };
  }

  /* ---- Chegada / check-in ---- */
  function clienteACaminho(id) {
    const ag = DT.db.agendamentoPorId(id);
    if (!ag || G.ativosPreChegada.indexOf(ag.status) < 0) return { ok: false, erro: 'Status atual não permite essa ação.' };
    const antes = ag.status;
    ag.status = S.A_CAMINHO;
    evento(ag, S.A_CAMINHO, 'Cliente informou que está a caminho');
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Registrou cliente a caminho', 'Agendamento', ag.pedido.numero, antes, S.A_CAMINHO);
    return { ok: true, ag: ag };
  }
  function registrarChegada(id, dados) {
    dados = dados || {};
    if (!DT.auth.pode('checkin.registrar')) return { ok: false, erro: 'Seu perfil não pode registrar chegadas.' };
    const ag = DT.db.agendamentoPorId(id);
    if (!ag) return { ok: false, erro: 'Agendamento não encontrado.' };
    if (G.ativosPreChegada.indexOf(ag.status) < 0) return { ok: false, erro: 'Chegada não pode ser registrada: status atual "' + ag.status + '".' };
    if (ag.data !== U.dataISO()) return { ok: false, erro: 'Este agendamento é para ' + U.fmtData(ag.data) + ' às ' + ag.hora + '. Peça ao Comercial para reagendar para hoje antes de registrar a chegada.' };
    let ts = new Date();
    let manual = false;
    if (dados.horaManual) {
      if (!DT.auth.pode('checkin.horarioManual')) return { ok: false, erro: 'Seu perfil não pode informar horário manual.' };
      if (!dados.motivoManual) return { ok: false, erro: 'Informe o motivo do horário manual.' };
      ts = U.toDate(U.dataISO(), dados.horaManual);
      if (ts > new Date()) return { ok: false, erro: 'O horário manual não pode estar no futuro.' };
      manual = true;
    }
    const antes = ag.status;
    ag.chegada = ts.toISOString();
    ag.veiculo = { placa: (dados.placa || '').toUpperCase(), motorista: dados.motorista || '', contato: dados.contato || ag.pedido.telefone || '' };
    ag.checkinPor = user().nome;
    ag.checkinManual = manual ? { motivo: dados.motivoManual } : null;
    ag.status = S.CHEGOU;
    const dif = U.difMin(U.toDate(ag.data, ag.hora), ts);
    let desc = 'Cliente chegou';
    if (dif !== null) desc += dif < 0 ? ' (' + U.fmtDuracao(-dif) + ' antes do horário)' : dif > 0 ? ' (' + U.fmtDuracao(dif) + ' após o horário)' : ' (no horário)';
    if (manual) desc += ' — horário informado manualmente: ' + dados.motivoManual;
    evento(ag, S.CHEGOU, desc, ag.chegada);
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Registrou chegada', 'Agendamento', ag.pedido.numero, antes, 'Cliente chegou ' + U.fmtHora(ag.chegada) + (manual ? ' (manual)' : ''));
    return { ok: true, ag: ag };
  }

  /* ---- Atendimento e carregamento ---- */
  function veiculosEmAtendimento(ignorarId) {
    return DT.db.agendamentos().filter(a => a.id !== ignorarId && (a.status === S.EM_ATENDIMENTO || a.status === S.CARREGANDO));
  }
  function iniciarAtendimento(id, dados) {
    if (!DT.auth.pode('atendimento.registrar')) return { ok: false, erro: 'Seu perfil não pode registrar atendimentos.' };
    const ag = DT.db.agendamentoPorId(id);
    if (!ag) return { ok: false, erro: 'Agendamento não encontrado.' };
    if (ag.status !== S.CHEGOU) return { ok: false, erro: 'O atendimento só pode começar depois do check-in do cliente.' };
    if (prepAtual(ag) !== S.PRONTO) return { ok: false, erro: 'O pedido ainda não está pronto (etapa atual: ' + prepAtual(ag) + '). Pedidos do Drive Thru precisam estar separados, conferidos e faturados.' };
    if (!dados.doca) return { ok: false, erro: 'Selecione a doca de atendimento.' };
    if (!dados.respAtendimento) return { ok: false, erro: 'Selecione o responsável pelo atendimento.' };
    const cfg = DT.db.settings();
    const emAt = veiculosEmAtendimento(id);
    if (emAt.length >= cfg.maxVeiculosSimultaneos) return { ok: false, erro: 'Limite de ' + cfg.maxVeiculosSimultaneos + ' veículos em atendimento simultâneo atingido. Finalize um atendimento antes de iniciar outro.' };
    const docaOcupada = emAt.find(a => a.doca === dados.doca);
    if (docaOcupada) return { ok: false, erro: dados.doca + ' está ocupada pelo pedido ' + docaOcupada.pedido.numero + '.' };
    ag.inicioAtendimento = new Date().toISOString();
    ag.doca = dados.doca;
    ag.respAtendimento = dados.respAtendimento;
    ag.respCarregamento = dados.respCarregamento || '';
    ag.obsAtendimento = dados.observacao || '';
    ag.status = S.EM_ATENDIMENTO;
    evento(ag, S.EM_ATENDIMENTO, 'Atendimento iniciado na ' + ag.doca + ' por ' + ag.respAtendimento);
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Iniciou atendimento', 'Agendamento', ag.pedido.numero, S.CHEGOU, S.EM_ATENDIMENTO + ' (' + ag.doca + ')');
    return { ok: true, ag: ag };
  }
  function iniciarCarregamento(id, respCarregamento) {
    if (!DT.auth.pode('atendimento.registrar')) return { ok: false, erro: 'Seu perfil não pode registrar carregamentos.' };
    const ag = DT.db.agendamentoPorId(id);
    if (!ag || ag.status !== S.EM_ATENDIMENTO) return { ok: false, erro: 'O carregamento só pode começar com o atendimento em andamento.' };
    if (respCarregamento) ag.respCarregamento = respCarregamento;
    if (!ag.respCarregamento) return { ok: false, erro: 'Selecione o responsável pelo carregamento.' };
    ag.inicioCarregamento = new Date().toISOString();
    ag.status = S.CARREGANDO;
    evento(ag, S.CARREGANDO, 'Carregamento iniciado (' + ag.respCarregamento + ')');
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Iniciou carregamento', 'Agendamento', ag.pedido.numero, S.EM_ATENDIMENTO, S.CARREGANDO);
    return { ok: true, ag: ag };
  }

  /* ---- Entrega e encerramento ---- */
  function finalizar(id, dados) {
    if (!DT.auth.pode('entrega.finalizar')) return { ok: false, erro: 'Seu perfil não pode finalizar retiradas.' };
    const ag = DT.db.agendamentoPorId(id);
    if (!ag) return { ok: false, erro: 'Agendamento não encontrado.' };
    if ([S.EM_ATENDIMENTO, S.CARREGANDO].indexOf(ag.status) < 0) return { ok: false, erro: 'A entrega só pode ser registrada com o atendimento em andamento.' };
    if (!dados.respCarregamento) return { ok: false, erro: 'Selecione o responsável pelo carregamento/entrega.' };
    const agora = new Date();
    if (!ag.inicioCarregamento) {
      ag.inicioCarregamento = agora.toISOString();
      evento(ag, S.CARREGANDO, 'Carregamento iniciado (' + dados.respCarregamento + ')');
    }
    ag.respCarregamento = dados.respCarregamento;
    ag.entrega = agora.toISOString();
    ag.status = S.ENTREGUE;
    evento(ag, S.ENTREGUE, 'Mercadoria entregue — responsável: ' + ag.respCarregamento);
    ag.encerramento = new Date(agora.getTime() + 1000).toISOString();
    ag.encerradoPor = user().nome;
    ag.obsEntrega = dados.observacao || '';
    ag.status = S.CONCLUIDO;
    evento(ag, S.CONCLUIDO, 'Retirada concluída por ' + ag.encerradoPor, ag.encerramento);
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Finalizou retirada', 'Agendamento', ag.pedido.numero, 'Em atendimento', S.CONCLUIDO + ' — entregue ' + U.fmtHora(ag.entrega));
    return { ok: true, ag: ag };
  }

  function marcarNaoCompareceu(id) {
    const ag = DT.db.agendamentoPorId(id);
    if (!ag || G.ativosPreChegada.indexOf(ag.status) < 0) return { ok: false, erro: 'Status atual não permite essa ação.' };
    if (!(DT.auth.pode('checkin.registrar') || DT.auth.pode('agendamento.alterar'))) return { ok: false, erro: 'Seu perfil não pode registrar ausência.' };
    const antes = ag.status;
    ag.status = S.NAO_COMPARECEU;
    evento(ag, S.NAO_COMPARECEU, 'Cliente não compareceu no horário ' + ag.hora + '. Janela liberada.');
    tocar(ag);
    DT.db.salvarAgendamento(ag);
    DT.audit.registrar('Registrou não comparecimento', 'Agendamento', ag.pedido.numero, antes, S.NAO_COMPARECEU);
    return { ok: true, ag: ag };
  }

  /* ---- Acompanhamento pelo cliente ----
     Código curto e difícil de adivinhar, derivado do id do agendamento
     (não expõe o número do pedido no link). */
  const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function codigo(ag) {
    if (ag.codigo) return ag.codigo;
    const h = U.sha256('acomp::' + ag.id);
    let c = '';
    for (let i = 0; i < 8; i++) c += ALFA[parseInt(h.substr(i * 2, 2), 16) % ALFA.length];
    return c;
  }
  function porCodigo(cod) {
    cod = String(cod || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cod) return null;
    return DT.db.agendamentos().find(a => codigo(a) === cod) || null;
  }
  /* Consulta manual: nº do pedido + 4 últimos dígitos do telefone cadastrado */
  function porPedidoTelefone(numero, final) {
    numero = String(numero || '').replace(/\D/g, '');
    final = String(final || '').replace(/\D/g, '');
    if (!numero || final.length !== 4) return null;
    const lista = doPedido(numero);
    const ag = lista[0];
    if (!ag) return null;
    const tel = String(ag.pedido.telefone || '').replace(/\D/g, '');
    return tel.slice(-4) === final ? ag : null;
  }
  function linkCliente(ag) {
    return location.href.split('#')[0] + '#acompanhar-' + codigo(ag);
  }

  return { ativoDoPedido, doPedido, elegibilidade, validarHorario, criar, reagendar, cancelar,
    codigo, porCodigo, porPedidoTelefone, linkCliente,
    prepAtual, proximaEtapa, etapaAnterior, avancarPreparacao, voltarPreparacao,
    clienteACaminho, registrarChegada, veiculosEmAtendimento, iniciarAtendimento, iniciarCarregamento,
    finalizar, marcarNaoCompareceu };
})();

/* ------------------------ Alertas e indicadores ----------------------- */
DT.kpi = (function () {
  const U = DT.util, S = DT.STATUS, G = DT.STATUS_GRUPOS;

  function tempos(ag) {
    const agendado = U.toDate(ag.data, ag.hora).toISOString();
    return {
      espera: U.difMin(ag.chegada, ag.inicioAtendimento),
      atendimento: U.difMin(ag.inicioAtendimento, ag.entrega),
      total: U.difMin(ag.chegada, ag.entrega),
      pontualidade: U.difMin(agendado, ag.chegada)
    };
  }

  /* Alertas operacionais (item 16) */
  function alertas(ag, agora) {
    agora = agora || new Date();
    const cfg = DT.db.settings();
    const slot = U.toDate(ag.data, ag.hora);
    const minAteSlot = (slot - agora) / 60000;
    const out = [];
    const prep = DT.ag.prepAtual(ag);
    const pronto = prep === S.PRONTO;

    if (G.ativosPreChegada.indexOf(ag.status) >= 0) {
      // cliente compartilhando a localização a caminho
      const rast = ag.status === S.A_CAMINHO && DT.rastreio ? DT.rastreio.info(ag.id) : null;
      if (rast && rast.noRaio && !rast.perdido) out.push({ tipo: 'chegando', nivel: pronto ? 'info' : 'crit', texto: pronto ? 'Cliente chegando' : 'Cliente chegando — pedido não está pronto' });
      if (rast && !rast.perdido && minAteSlot < -cfg.toleranciaMin) out.push({ tipo: 'clienteAtrasado', nivel: 'warn', texto: 'Cliente atrasado (a caminho)' });
      else if (minAteSlot < -cfg.noShowMin) out.push({ tipo: 'noshow', nivel: 'crit', texto: 'Cliente não compareceu' });
      else if (minAteSlot < -cfg.toleranciaMin) out.push({ tipo: 'clienteAtrasado', nivel: 'warn', texto: 'Cliente atrasado' });
      if (!pronto && minAteSlot <= cfg.preparacaoCriticaMin && minAteSlot >= -cfg.noShowMin) out.push({ tipo: 'critica', nivel: 'crit', texto: 'Preparação crítica' });
      else if (G.naoSeparado.indexOf(prep) >= 0 && ag.data === U.dataISO(agora) && minAteSlot > cfg.preparacaoCriticaMin) out.push({ tipo: 'pendente', nivel: 'warn', texto: 'Preparação pendente' });
    }
    if (ag.chegada && G.finalizados.indexOf(ag.status) < 0) {
      const dif = U.difMin(slot, ag.chegada);
      if (dif < -cfg.toleranciaMin) out.push({ tipo: 'antecipado', nivel: 'info', texto: 'Cliente chegou antecipadamente' });
      if (dif > cfg.toleranciaMin) out.push({ tipo: 'atendAtrasado', nivel: 'warn', texto: 'Atendimento atrasado' });
      if (ag.status === S.CHEGOU && !pronto) out.push({ tipo: 'aguardandoPrep', nivel: 'crit', texto: 'Cliente aguardando — pedido não está pronto' });
    }
    return out;
  }

  function resumoDia(data) {
    const ags = DT.db.agendamentos().filter(a => a.data === data);
    const agora = new Date();
    const cont = st => ags.filter(a => st.indexOf(a.status) >= 0).length;
    const ativos = ags.filter(a => a.status !== S.CANCELADO);
    const atrasados = ags.filter(a => alertas(a, agora).some(x => ['clienteAtrasado', 'critica', 'atendAtrasado', 'aguardandoPrep'].indexOf(x.tipo) >= 0)).length;
    const mapa = DT.agenda.mapaDia(data);
    const capTotal = mapa.reduce((s, j) => s + j.capacidade, 0);
    const ocupadas = mapa.reduce((s, j) => s + Math.min(j.ocupados, j.capacidade), 0);
    return {
      agendados: ativos.length,
      aguardandoPreparacao: ags.filter(a => G.ativosPreChegada.concat([S.CHEGOU]).indexOf(a.status) >= 0 && DT.ag.prepAtual(a) !== S.PRONTO).length,
      prontos: ags.filter(a => DT.ag.prepAtual(a) === S.PRONTO && G.ativosPreChegada.concat([S.CHEGOU]).indexOf(a.status) >= 0).length,
      aguardados: cont(G.ativosPreChegada),
      chegaram: ags.filter(a => a.chegada).length,
      emAtendimento: cont([S.CHEGOU, S.EM_ATENDIMENTO, S.CARREGANDO, S.ENTREGUE]),
      concluidos: cont([S.CONCLUIDO]),
      atrasados: atrasados,
      cancelados: cont([S.CANCELADO]),
      naoCompareceu: cont([S.NAO_COMPARECEU]),
      capacidadeTotal: capTotal,
      janelasOcupadas: ocupadas,
      ocupacaoPct: capTotal ? Math.round(ocupadas / capTotal * 100) : 0
    };
  }

  /* Metas de prazo (Configurações › Operação): % de pedidos prontos antes da
     chegada do cliente e % de clientes levados à doca dentro do tempo-meta */
  function metas(ags) {
    const s = DT.db.settings();
    const metaMin = Number(s.metaAtendimentoMin) || 15;
    const chegaram = ags.filter(a => a.chegada && a.status !== S.CANCELADO);
    const prontosAntes = chegaram.filter(a => { const e = a.etapas && a.etapas[S.PRONTO]; return e && e.ts && e.ts <= a.chegada; }).length;
    const esperas = chegaram.map(a => U.difMin(a.chegada, a.inicioAtendimento)).filter(x => x !== null && x >= 0);
    return {
      comChegada: chegaram.length, comAtendimento: esperas.length,
      prontosAntesPct: chegaram.length ? Math.round(prontosAntes / chegaram.length * 100) : null,
      atendidosNoPrazoPct: esperas.length ? Math.round(esperas.filter(x => x <= metaMin).length / esperas.length * 100) : null,
      esperaMedia: U.media(esperas),
      metaProntoAntesPct: Number(s.metaProntoAntesPct) || 90, metaAtendidosPct: Number(s.metaAtendidosPct) || 80, metaAtendimentoMin: metaMin
    };
  }
  return { tempos, alertas, resumoDia, metas };
})();
