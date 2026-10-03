/* =====================================================================
   DRIVE THRU — Configurações e constantes do sistema
   Tudo que for regra operacional ajustável fica em DEFAULT_SETTINGS
   e pode ser alterado pelo Administrador em "Configurações".
   ===================================================================== */
window.DT = window.DT || {};

DT.APP = {
  nome: 'Drive Thru',
  subtitulo: 'Materiais para Construção',
  versao: '0.7.0',
  storagePrefix: 'dt_app_v1_',
  sessaoHoras: 10,
  /* Responsável pelo projeto — exibido na barra superior, antes do relógio */
  /* Empresa usuária — logo (PNG transparente, letras brancas) usada no menu, no acompanhamento do cliente e nos PDFs */
  empresa: { nome: 'Condor', slogan: 'O Atacado da Construção', logo: 'img/logo-condor.png?v=17', cor: '#AB0F14', fundo: '#303A42' },
  responsavel: { nome: 'Francisco Mendes', papel: 'Responsável pelo projeto', foto: 'img/responsavel.jpg?v=13' }
};

/* Parâmetros operacionais (padrão inicial do projeto).
   20 janelas de 30 min (08:00–18:00) com 1 pedido por janela = 2 atendimentos/hora. */
DT.DEFAULT_SETTINGS = {
  horaInicio: '08:00',
  horaFim: '18:00',
  intervaloMin: 30,              // intervalo entre horários (duração da janela)
  pedidosPorJanela: 1,           // quantidade de pedidos por janela
  maxVeiculosSimultaneos: 2,     // limite de veículos atendidos ao mesmo tempo
  antecedenciaMinMin: 60,        // antecedência mínima do agendamento (regra: 1 hora)
  diasFuncionamento: [1, 2, 3, 4, 5, 6], // 0=Dom ... 6=Sáb
  diasAgendaAFrente: 14,         // até quantos dias à frente pode agendar
  toleranciaMin: 15,             // tolerância para considerar chegada antecipada/atrasada
  noShowMin: 30,                 // minutos após o horário para alertar "não compareceu"
  preparacaoCriticaMin: 30,      // faltando X min e pedido não pronto = preparação crítica
  limiteItens: 0,                // 0 = sem limite; >0 bloqueia pedidos com mais itens
  docas: ['Doca 14 - Drive Thru', 'Doca 15 - Drive Thru'],
  unidade: 'CD - Unidade Principal',
  lgpdModo: 'cada_login',        // 'cada_login' ou 'uma_vez' (uma vez por versão do termo)
  lgpdEncarregado: '',           // contato do Encarregado de Dados (DPO), exibido no termo
  rastreioAtivo: true,           // cliente pode compartilhar a localização a caminho do Drive Thru
  localCD: null,                 // { lat, lng, endereco } — ponto de chegada exibido no mapa
  raioChegadaKm: 2               // distância para o alerta "cliente chegando"
};

/* Status operacionais (item 9 do escopo) */
DT.STATUS = {
  PEDIDO_REALIZADO: 'Pedido realizado',
  AGUARDANDO_AGENDAMENTO: 'Aguardando agendamento',
  AGENDADO: 'Agendado',
  EM_PREPARACAO: 'Em preparação',
  SEPARADO: 'Separado',
  CONFERIDO: 'Conferido',
  FATURADO: 'Faturado',
  PRONTO: 'Pronto para retirada',
  A_CAMINHO: 'Cliente a caminho',
  CHEGOU: 'Cliente chegou',
  EM_ATENDIMENTO: 'Em atendimento',
  CARREGANDO: 'Carregamento iniciado',
  ENTREGUE: 'Pedido entregue',
  CONCLUIDO: 'Retirada concluída',
  CANCELADO: 'Cancelado',
  NAO_COMPARECEU: 'Não compareceu',
  REAGENDADO: 'Reagendado'
};

/* Classe visual de cada status (cores definidas no CSS) */
DT.STATUS_TONE = {
  'Pedido realizado': 'neutral',
  'Aguardando agendamento': 'neutral',
  'Agendado': 'blue',
  'Reagendado': 'blue',
  'Em preparação': 'amber',
  'Separado': 'violet',
  'Conferido': 'indigo',
  'Faturado': 'teal',
  'Pronto para retirada': 'green',
  'Cliente a caminho': 'cyan',
  'Cliente chegou': 'cyan',
  'Em atendimento': 'navy',
  'Carregamento iniciado': 'navy',
  'Pedido entregue': 'done',
  'Retirada concluída': 'done',
  'Cancelado': 'red',
  'Não compareceu': 'red'
};

/* Sequência de preparação (Logística) */
DT.FLUXO_PREPARACAO = ['Agendado', 'Em preparação', 'Separado', 'Conferido', 'Faturado', 'Pronto para retirada'];

/* Agrupamentos úteis */
DT.STATUS_GRUPOS = {
  ativosPreChegada: ['Agendado', 'Reagendado', 'Em preparação', 'Separado', 'Conferido', 'Faturado', 'Pronto para retirada', 'Cliente a caminho'],
  aguardandoPreparacao: ['Agendado', 'Reagendado', 'Em preparação', 'Separado', 'Conferido', 'Faturado'],
  naoSeparado: ['Agendado', 'Reagendado', 'Em preparação'],
  noLocal: ['Cliente chegou', 'Em atendimento', 'Carregamento iniciado', 'Pedido entregue'],
  emAtendimento: ['Em atendimento', 'Carregamento iniciado', 'Pedido entregue'],
  finalizados: ['Retirada concluída', 'Cancelado', 'Não compareceu'],
  ocupamJanela: ['Agendado', 'Reagendado', 'Em preparação', 'Separado', 'Conferido', 'Faturado', 'Pronto para retirada', 'Cliente a caminho', 'Cliente chegou', 'Em atendimento', 'Carregamento iniciado', 'Pedido entregue', 'Retirada concluída']
};

/* Permissões disponíveis */
DT.PERMISSOES = {
  'pedido.consultar': 'Consultar pedidos no ERP',
  'agendamento.criar': 'Criar agendamentos',
  'agendamento.alterar': 'Reagendar e cancelar',
  'agenda.ver': 'Consultar agenda',
  'pedido.acompanhar': 'Ver linha do tempo do pedido',
  'preparacao.alterar': 'Alterar status de preparação / conferência',
  'checkin.registrar': 'Registrar chegada do cliente',
  'checkin.horarioManual': 'Informar horário manual (exceção)',
  'atendimento.registrar': 'Registrar atendimento e carregamento',
  'entrega.finalizar': 'Registrar entrega e finalizar retirada',
  'dashboard.ver': 'Visualizar dashboard operacional',
  'relatorios.ver': 'Gerar relatórios e indicadores',
  'auditoria.ver': 'Consultar histórico/auditoria',
  'usuarios.gerenciar': 'Criar usuários e alterar permissões',
  'funcionarios.gerenciar': 'Cadastrar funcionários',
  'config.alterar': 'Configurar horários, janelas e parâmetros'
};

/* Perfis padrão (item 20 do escopo). O Administrador pode editar essa matriz. */
DT.DEFAULT_PERFIS = {
  comercial: {
    nome: 'Comercial',
    permissoes: ['pedido.consultar', 'agendamento.criar', 'agendamento.alterar', 'agenda.ver', 'pedido.acompanhar']
  },
  logistica: {
    nome: 'Logística',
    permissoes: ['agenda.ver', 'pedido.acompanhar', 'preparacao.alterar', 'checkin.registrar', 'atendimento.registrar', 'entrega.finalizar', 'dashboard.ver']
  },
  gestor: {
    nome: 'Gestor',
    permissoes: ['agenda.ver', 'pedido.acompanhar', 'dashboard.ver', 'relatorios.ver', 'auditoria.ver']
  },
  admin: {
    nome: 'Administrador',
    permissoes: Object.keys(DT.PERMISSOES)
  }
};

/* Menu: cada item exige uma permissão */
DT.MENU = [
  { grupo: 'Comercial', itens: [
    { id: 'agendar', label: 'Novo agendamento', icon: 'plus', perm: 'agendamento.criar' },
    { id: 'agenda', label: 'Agenda de retiradas', icon: 'calendar', perm: 'agenda.ver' }
  ]},
  { grupo: 'Operação', itens: [
    { id: 'preparacao', label: 'Preparação', icon: 'box', perm: 'preparacao.alterar' },
    { id: 'mapa', label: 'Mapa de chegadas', icon: 'map', perm: 'checkin.registrar' },
    { id: 'checkin', label: 'Check-in', icon: 'pin', perm: 'checkin.registrar' },
    { id: 'atendimento', label: 'Atendimento', icon: 'truck', perm: 'atendimento.registrar' },
    { id: 'entrega', label: 'Entrega', icon: 'check', perm: 'entrega.finalizar' },
    { id: 'pedido', label: 'Acompanhar pedido', icon: 'timeline', perm: 'pedido.acompanhar' }
  ]},
  { grupo: 'Gestão', itens: [
    { id: 'dashboard', label: 'Dashboard', icon: 'grid', perm: 'dashboard.ver' },
    { id: 'relatorios', label: 'Relatórios', icon: 'chart', perm: 'relatorios.ver' },
    { id: 'auditoria', label: 'Auditoria', icon: 'shield', perm: 'auditoria.ver' }
  ]},
  { grupo: 'Administração', itens: [
    { id: 'usuarios', label: 'Usuários e perfis', icon: 'users', perm: 'usuarios.gerenciar' },
    { id: 'funcionarios', label: 'Funcionários', icon: 'id', perm: 'funcionarios.gerenciar' },
    { id: 'config', label: 'Configurações', icon: 'gear', perm: 'config.alterar' }
  ]}
];

/* Integração com ERP.
   modo 'mock'  -> usa base simulada (js/erp.js)
   modo 'api'   -> chama baseUrl + '/pedidos/{numero}' e converte com DT.ERP.mapear() */
DT.ERP_CONFIG = {
  modo: 'mock',
  baseUrl: 'https://erp.suaempresa.com.br/api',
  timeoutMs: 8000
};

/* Banco de dados na nuvem (Supabase).
   A chave abaixo é a chave PÚBLICA do projeto (feita para ficar no navegador);
   a proteção dos dados é feita pelas regras de acesso (RLS) no banco.
   Deixe url vazia para usar o modo local (dados só no navegador). */
DT.SUPABASE = {
  url: 'https://yvwxqwkyttycopumgyet.supabase.co',
  chave: 'sb_publishable_M8MqobrHcBeXgNMjcBKLxQ_2jpbCxLC',
  dominioLogin: '@drivethru.app'   // login "joao.silva" entra como joao.silva@drivethru.app
};

/* Regra de senha forte — manter igual à configuração do Supabase
   (Authentication › Sign In / Providers › Email › Password requirements). */
DT.SENHA = {
  minimo: 8,
  simbolos: "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"
};
