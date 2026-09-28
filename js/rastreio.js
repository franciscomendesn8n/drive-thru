/* =====================================================================
   Rastreamento do cliente a caminho do Drive Thru
   ---------------------------------------------------------------------
   • O cliente toca em "Estou a caminho" na página de acompanhamento e
     autoriza o navegador a compartilhar a localização.
   • A posição vai para o servidor (tabela dt_rastreio) a cada ~15 s.
   • A equipe vê o mapa, a distância e a previsão de chegada, e recebe um
     alerta quando o cliente entra no raio configurado.
   • No check-in (ou cancelamento / não comparecimento / conclusão) a
     localização é apagada automaticamente.
   Modo local: os dados ficam no navegador (mesmo computador).
   ===================================================================== */
window.DT = window.DT || {};

DT.rastreio = (function () {
  const U = DT.util, S = DT.STATUS, G = DT.STATUS_GRUPOS;
  const nuvem = () => DT.db.modoNuvem();
  const ouvintes = [];
  const alertados = new Set();
  const simulacoes = {};        // agId -> { timer, pontos, i }
  const SINAL_PERDIDO_MIN = 3;  // sem atualização há mais de 3 min

  /* ---------------------------- cálculos ---------------------------- */
  function distanciaKm(a, b) {
    if (!a || !b) return null;
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  /* Velocidade média (km/h): usa o GPS quando confiável; senão, o deslocamento recente */
  function velocidadeKmh(r) {
    if (r.velocidade != null && r.velocidade > 2) return Math.min(70, Math.max(15, r.velocidade * 3.6));
    const t = r.trilha || [];
    if (t.length >= 2) {
      const a = t[Math.max(0, t.length - 6)], b = t[t.length - 1];
      const horas = (new Date(b.ts) - new Date(a.ts)) / 3600000;
      if (horas > 0) {
        const v = distanciaKm(a, b) / horas;
        if (v > 5) return Math.min(70, Math.max(15, v));
      }
    }
    return 30;   // média urbana
  }
  /* Previsão de chegada em minutos (distância pelas ruas ≈ 1,35 × linha reta) */
  function etaMin(distKm, r) {
    if (distKm == null) return null;
    if (distKm < 0.15) return 0;
    return Math.max(1, Math.round(distKm * 1.35 / velocidadeKmh(r) * 60));
  }
  function fmtKm(km) {
    if (km == null) return '—';
    return km < 1 ? Math.round(km * 1000 / 10) * 10 + ' m' : km.toFixed(1).replace('.', ',') + ' km';
  }
  function fmtEta(min) {
    if (min == null) return '';
    if (min === 0) return 'chegando';
    return '~' + (min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60) + ' min' : min + ' min');
  }

  /* ---------------------------- dados ---------------------------- */
  function mapa() { return DT.db.memoria.ler('rastreio') || {}; }
  function gravarMapa(m) { DT.db.memoria.gravar('rastreio', m); }
  function cd() { const c = DT.db.settings().localCD; return c && isFinite(c.lat) && isFinite(c.lng) ? c : null; }

  /* Clientes compartilhando a localização agora (só pedidos ainda não chegados) */
  function ativos() {
    const m = mapa(), destino = cd(), cfg = DT.db.settings();
    const agora = Date.now();
    const out = [];
    let limpou = false;
    Object.keys(m).forEach(id => {
      const ag = DT.db.agendamentoPorId(id);
      if (!ag || G.ativosPreChegada.indexOf(ag.status) < 0) {
        // no modo local a limpeza é feita aqui; na nuvem, pelo servidor
        if (!nuvem()) { delete m[id]; limpou = true; }
        return;
      }
      const r = m[id];
      const dist = destino ? distanciaKm(r, destino) : null;
      const idadeMin = (agora - new Date(r.atualizadoEm).getTime()) / 60000;
      out.push({ ag: ag, r: r, dist: dist, eta: etaMin(dist, r), idadeMin: idadeMin,
        perdido: idadeMin > SINAL_PERDIDO_MIN, noRaio: dist != null && dist <= (cfg.raioChegadaKm || 2) });
    });
    if (limpou) gravarMapa(m);
    return out.sort((a, b) => (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist));
  }
  function info(agId) { return ativos().find(x => x.ag.id === agId) || null; }

  /* Texto curto para as filas da operação */
  function chip(ag) {
    const i = info(ag.id);
    if (!i) return '';
    const cls = i.perdido ? 'lost' : i.noRaio ? 'near' : '';
    return '<span class="rast-chip ' + cls + '" title="Localização compartilhada pelo cliente">' + DT.ui.icon('nav') +
      (i.dist == null ? 'a caminho' : fmtKm(i.dist) + (i.perdido ? ' · sem sinal' : ' · ' + fmtEta(i.eta))) + '</span>';
  }

  /* ---------------------------- envio (cliente) ---------------------------- */
  async function enviar(codigo, pos, simulado) {
    if (nuvem()) return DT.nuvem.enviarLocalizacao(codigo, pos, simulado);
    return enviarLocal(codigo, pos, simulado);
  }
  async function parar(codigo) {
    if (nuvem()) return DT.nuvem.pararLocalizacao(codigo);
    const ag = DT.ag.porCodigo(codigo);
    if (ag) { const m = mapa(); delete m[ag.id]; gravarMapa(m); mudou(); }
    return true;
  }
  function compartilhando(agId) { return !!mapa()[agId]; }

  function enviarLocal(codigo, pos, simulado) {
    const ag = DT.ag.porCodigo(codigo);
    if (!ag) return { ok: false, erro: 'nao_encontrado' };
    const m = mapa();
    if (G.ativosPreChegada.indexOf(ag.status) < 0) { delete m[ag.id]; gravarMapa(m); return { ok: false, erro: 'encerrado' }; }
    if (ag.data !== U.dataISO()) return { ok: false, erro: 'outro_dia' };
    const agora = new Date().toISOString();
    const r = m[ag.id] || { agId: ag.id, inicio: agora, trilha: [] };
    Object.assign(r, { lat: pos.lat, lng: pos.lng, precisao: pos.precisao, velocidade: pos.velocidade, rumo: pos.rumo, simulado: !!simulado, atualizadoEm: agora });
    r.trilha = r.trilha.concat([{ lat: pos.lat, lng: pos.lng, ts: agora }]).slice(-60);
    m[ag.id] = r;
    gravarMapa(m);
    if (ag.status !== S.A_CAMINHO) {
      const antes = ag.status;
      ag.status = S.A_CAMINHO;
      ag.historico = ag.historico || [];
      ag.historico.push({ ts: agora, status: S.A_CAMINHO, usuario: 'Cliente',
        desc: simulado ? 'Trajeto simulado (demonstração) — cliente a caminho' : 'Cliente compartilhou a localização e está a caminho' });
      ag.alteradoEm = agora; ag.alteradoPor = 'Cliente';
      DT.db.salvarAgendamento(ag);
      DT.db.registrarAuditoria({ id: U.uid('aud'), ts: agora, userId: null, usuario: 'Cliente (página de acompanhamento)',
        acao: 'Cliente a caminho (localização)', entidade: 'Agendamento', referencia: ag.pedido.numero,
        antes: antes, depois: S.A_CAMINHO + (simulado ? ' (simulação)' : '') });
    }
    mudou();
    return { ok: true };
  }

  /* ---------------------------- avisos à equipe ---------------------------- */
  function aoMudar(fn) { ouvintes.push(fn); }
  let timerMudou = null;
  function mudou() {
    clearTimeout(timerMudou);
    timerMudou = setTimeout(() => {
      verificarChegadas();
      ouvintes.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
    }, 120);
  }
  function bip() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.18].forEach((d, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = [660, 990][i];
        g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.16);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.18);
      });
      setTimeout(() => { try { ctx.close(); } catch (e) { /* ignora */ } }, 800);
    } catch (e) { /* sem som */ }
  }
  /* Alerta único por pedido quando o cliente entra no raio de chegada */
  function verificarChegadas() {
    const u = DT.auth.usuarioAtual && DT.auth.usuarioAtual();
    if (!u || !document.getElementById('view') || !DT.auth.pode('checkin.registrar')) return;
    ativos().forEach(i => {
      if (!i.noRaio || i.perdido || alertados.has(i.ag.id)) return;
      alertados.add(i.ag.id);
      bip();
      DT.ui.toast('Cliente chegando: ' + i.ag.pedido.cliente + ' (pedido ' + i.ag.pedido.numero + ') — a ' + fmtKm(i.dist) + ', ' + fmtEta(i.eta) + '. Horário agendado: ' + i.ag.hora + '.', 'warn');
    });
  }

  /* No modo local, a página do cliente pode estar em outra aba do mesmo navegador */
  window.addEventListener('storage', e => {
    if (!nuvem() && e.key === DT.APP.storagePrefix + 'rastreio') mudou();
  });

  /* ---------------------------- simulação (demonstração) ----------------------------
     Gera um trajeto de ~6 km até o CD e "dirige" o cliente, um ponto a cada 3 s.
     Usa o mesmo caminho de envio da página do cliente. */
  function pontoA(origem, km, rumoGraus) {
    const R = 6371, d = km / R, br = rumoGraus * Math.PI / 180;
    const la1 = origem.lat * Math.PI / 180, lo1 = origem.lng * Math.PI / 180;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
    const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return { lat: la2 * 180 / Math.PI, lng: lo2 * 180 / Math.PI };
  }
  function rumo(a, b) {
    const rad = x => x * Math.PI / 180;
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  /* Trajeto pelas ruas (serviço público OSRM); sem internet, um trajeto em "L" */
  async function trajeto(origem, destino) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const url = 'https://router.project-osrm.org/route/v1/driving/' + origem.lng + ',' + origem.lat + ';' + destino.lng + ',' + destino.lat + '?overview=full&geometries=geojson';
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      const j = await resp.json();
      const coords = j.routes && j.routes[0] && j.routes[0].geometry.coordinates;
      if (coords && coords.length > 1) return coords.map(c => ({ lat: c[1], lng: c[0] }));
    } catch (e) { /* usa o trajeto simples */ }
    const meio = { lat: origem.lat, lng: destino.lng };
    return [origem, meio, destino];
  }
  /* Reamostra a linha em pontos igualmente espaçados */
  function reamostrar(linha, passos) {
    const acum = [0];
    for (let i = 1; i < linha.length; i++) acum.push(acum[i - 1] + distanciaKm(linha[i - 1], linha[i]));
    const total = acum[acum.length - 1];
    const out = [];
    for (let k = 0; k <= passos; k++) {
      const alvo = total * k / passos;
      let i = 1;
      while (i < linha.length - 1 && acum[i] < alvo) i++;
      const seg = acum[i] - acum[i - 1] || 1;
      const f = Math.min(1, Math.max(0, (alvo - acum[i - 1]) / seg));
      out.push({ lat: linha[i - 1].lat + (linha[i].lat - linha[i - 1].lat) * f, lng: linha[i - 1].lng + (linha[i].lng - linha[i - 1].lng) * f });
    }
    return out;
  }
  async function simular(agId) {
    const destino = cd();
    const ag = DT.db.agendamentoPorId(agId);
    if (!destino) return { ok: false, erro: 'Defina primeiro o local do CD no mapa.' };
    if (!ag || G.ativosPreChegada.indexOf(ag.status) < 0) return { ok: false, erro: 'Este pedido não está aguardando a chegada do cliente.' };
    if (ag.data !== U.dataISO()) return { ok: false, erro: 'A simulação só vale para retiradas agendadas para hoje.' };
    pararSimulacao(agId, true);
    const origem = pontoA(destino, 5.5 + Math.random() * 1.5, Math.random() * 360);
    const linha = await trajeto(origem, destino);
    const pontos = reamostrar(linha, 34).slice(0, -1);   // para a ~150 m do CD; a chegada é pelo check-in
    const cod = DT.ag.codigo(ag);
    const sim = { i: 0, pontos: pontos, timer: null };
    simulacoes[agId] = sim;
    const passo = async () => {
      if (simulacoes[agId] !== sim) return;
      const p = sim.pontos[sim.i];
      const prox = sim.pontos[Math.min(sim.i + 1, sim.pontos.length - 1)];
      try {
        const r = await enviar(cod, { lat: p.lat, lng: p.lng, precisao: 8, velocidade: 11, rumo: rumo(p, prox) }, true);
        if (r && r.ok === false && r.erro !== 'nao_encontrado') { pararSimulacao(agId, true); return; }
      } catch (e) { /* sem conexão: tenta o próximo ponto */ }
      sim.i++;
      if (sim.i >= sim.pontos.length) { delete simulacoes[agId]; mudou(); return; }
      sim.timer = setTimeout(passo, 3000);
    };
    passo();
    return { ok: true, km: distanciaKm(origem, destino) };
  }
  function simulando(agId) { return !!simulacoes[agId]; }
  async function pararSimulacao(agId, manterLocal) {
    const s = simulacoes[agId];
    if (s) { clearTimeout(s.timer); delete simulacoes[agId]; }
    if (!manterLocal) {
      const ag = DT.db.agendamentoPorId(agId);
      if (ag) { try { await parar(DT.ag.codigo(ag)); } catch (e) { /* ignora */ } }
      if (nuvem()) { const m = mapa(); delete m[agId]; gravarMapa(m); }
      mudou();
    }
  }

  return { distanciaKm, etaMin, fmtKm, fmtEta, velocidadeKmh, cd, ativos, info, chip, compartilhando,
    enviar, parar, aoMudar, mudou, simular, simulando, pararSimulacao };
})();
