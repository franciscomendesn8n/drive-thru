# Drive Thru — Agendamento e Controle de Retiradas

Aplicativo web (HTML + CSS + JavaScript puro) para controlar a retirada de pedidos pelo Drive Thru,
do agendamento feito pelo Comercial até a entrega da mercadoria no veículo do cliente.

## Como abrir

Não precisa instalar nada. Abra o arquivo `index.html` no navegador (Chrome, Edge ou Firefox).

Para publicar na rede da empresa, copie a pasta inteira para qualquer servidor web (IIS, Apache, Nginx)
ou rode localmente:

```bash
python -m http.server 8080
# depois acesse http://localhost:8080
```

## Usuários de teste (somente no modo demonstração, neste navegador)

Perfis de demonstração: Administrador (`admin`), Comercial (`joao.silva`, `fernanda.rocha`,
`inacio.sardinha`), Logística (`ana.santos`, `carlos.lima`), Operador de coletor (`marcos.pereira`)
e Gestor (`gestor`). As senhas de demonstração não são publicadas aqui; peça ao administrador do
projeto. No servidor real, esses usuários devem ser desativados em
**Configurações › Segurança e dados › Checklist para operação real**.

## Pedidos de teste (ERP simulado)

| Pedido            | Situação                                  |
|-------------------|-------------------------------------------|
| 123456, 123789, 124001, 125300–125320 | Livres para agendar |
| 123101 a 123116   | Já agendados hoje (vários status)         |
| 125900 / 125901 / 125902 | Não elegíveis (motivos diferentes) |
| 999999            | Inexistente                               |
| 130001 / 130002 / 130003 | Jose Carlos Milito · vendedor Inácio Sardinha — apresentação à diretoria (130002 e 130003 = testes extras) |
| 220001 a 220010 | 10 pedidos extras de teste, clientes variados, sem agendamento (data do pedido = hoje) |

Na primeira abertura o sistema gera 14 dias de histórico e a agenda de hoje com base no horário atual,
para que dashboard, alertas e relatórios já tenham dados. Em **Configurações** é possível recriar os
dados de demonstração ou apagar os agendamentos e começar a operação real.

## Telas

| Tela | Perfil | O que faz |
|---|---|---|
| Login | todos | Usuário e senha; o menu é montado pelas permissões do perfil |
| Novo agendamento | Comercial | Digita o pedido → dados do ERP → escolhe data e janela → confirmação |
| Agenda de retiradas | todos | Agenda visual por janela, vagas, status, alertas, reagendar/cancelar |
| Preparação | Logística | Agendado → Em preparação → Separado → Conferido → Faturado → Pronto |
| Mapa de chegadas | Logística | Clientes a caminho no mapa, distância, previsão de chegada, alerta de aproximação e simulação |
| Check-in | Logística | Chegada do cliente com horário automático (manual só com permissão) |
| Atendimento | Logística | Doca, responsáveis, início do atendimento e do carregamento |
| Entrega | Logística | Hora da entrega automática, responsável, encerramento |
| Acompanhar pedido | todos | Linha do tempo completa do pedido e reagendamentos |
| Dashboard | Logística, Gestor | 10 indicadores, agenda do dia, ocupação, alertas, tempos médios |
| Relatórios | Gestor | 7 relatórios com filtros, exportação CSV, PDF com cabeçalho da empresa e cópia para Excel |
| Auditoria | Gestor | Quem fez o quê, quando, valor anterior e novo |
| Usuários e perfis | Admin | Usuários, senhas e matriz de permissões por perfil |
| Funcionários | Admin | Cadastro com foto (recorte e compressão automáticos); lista usada nos campos de responsável |
| Configurações | Admin | Horários, intervalo, vagas por janela, veículos simultâneos, regras de alerta, docas e **aparência** (logo, cores e textos do login) |

## Banco de dados na nuvem (Supabase)

Com `DT.SUPABASE` preenchido em `js/config.js`, o sistema usa o projeto Supabase **Drive Thru**
(região São Paulo) e todos os aparelhos compartilham os mesmos dados, em tempo real.
Abrindo o `index.html` direto do disco (file://), o sistema usa o **modo local** (dados no navegador).

| Parte | Onde fica |
|---|---|
| Login da equipe | Supabase Auth — usuário `joao.silva` entra como `joao.silva@drivethru.app` |
| Dados | Tabelas `dt_agendamentos`, `dt_usuarios`, `dt_funcionarios`, `dt_config`, `dt_auditoria` |
| Segurança | RLS: só usuários ativos leem/gravam; configurações e funcionários só com permissão; auditoria só inclusão; anônimo não lê nenhuma tabela |
| Página do cliente | Funções `dt_acompanhar(codigo)` e `dt_acompanhar_pedido(numero, final_telefone)` devolvem só dados não sensíveis |
| Usuários e senhas | Função `dt-usuarios` (Edge Function) — só quem tem a permissão "usuarios.gerenciar" |
| Tempo real | Supabase Realtime atualiza agenda, dashboard e filas sem recarregar |

A chave em `js/config.js` é a chave **pública** do projeto (feita para ficar no navegador); a proteção
está nas regras de acesso do banco. No primeiro acesso de um administrador, a base vazia recebe os
dados de demonstração.

### Senhas

- Regra de senha forte (em `DT.SENHA`, na tela e na função do servidor): mínimo de 8 caracteres, com
  letra minúscula, maiúscula, número e símbolo.
- Cada usuário troca a própria senha pelo ícone de chave ao lado do nome (pede a senha atual).
- Se o Supabase avisar que a senha está fora das regras, o sistema pede a troca logo após o login.
- No Supabase, configure a mesma regra em Authentication › Sign In / Providers › Email.
  A "proteção contra senhas vazadas" só existe a partir do plano Pro.

**Antes de usar com clientes reais:** trocar as senhas de teste (primeiro a do administrador),
configurar as regras de senha no Supabase, desativar os usuários de demonstração e apagar os dados de
demonstração (Configurações › Começar operação real).

## Termo LGPD após o login

Logo após o login, o sistema mostra o **Termo de Ciência e Responsabilidade no Tratamento de Dados
Pessoais** (Lei nº 13.709/2018). O acesso só é liberado depois que o usuário marca a declaração de
ciência e clica em **OK**. Quem clica em "Não aceito — sair" volta ao login.

- Cada aceite (e recusa) fica na **Auditoria**: usuário, data, hora e versão do termo.
- Em Configurações: exibir **a cada login** (padrão) ou **uma vez por versão do termo**, e o contato
  do Encarregado de Dados (DPO), que aparece no termo.
- O texto fica em `js/lgpd.js`. Ao mudar o texto, aumente `DT.LGPD.versao`.
- A página do cliente (acompanhamento) não passa pelo termo.
- O texto é um modelo e deve ser validado pelo jurídico / Encarregado de Dados da empresa.

## Página do cliente (acompanhamento)

Após o agendamento, o comprovante mostra um **link** e um **QR Code** para o cliente
(`index.html#acompanhar-CODIGO`). A página não exige login e mostra só as etapas:
agendada → em separação → conferido e faturado → pronto para retirada → concluída.

- Atualiza sozinha (a cada 15 s e na hora, se a equipe usar o mesmo computador).
- Botão **Avise-me**: toca um som e envia notificação do navegador quando o pedido fica pronto.
- Também é possível consultar em `index.html#acompanhar` com nº do pedido + 4 últimos dígitos do telefone.
- O código não revela o número do pedido; o QR Code é gerado localmente (`js/vendor/qrcode.js`, licença MIT).
- Em produção, o link precisa apontar para um servidor acessível pela internet, e o aviso pode ir também por WhatsApp/SMS.

## Cliente a caminho (localização e mapa)

Na página de acompanhamento, no dia da retirada, o cliente toca em **Estou a caminho** e autoriza o
navegador a compartilhar a localização. A equipe acompanha em **Operação › Mapa de chegadas**.

- O pedido passa sozinho para **Cliente a caminho** (linha do tempo e auditoria registram "Cliente").
- O mapa mostra o CD, o raio de alerta, cada cliente, o trajeto percorrido, a distância e a previsão
  de chegada (distância pelas ruas ≈ 1,35 × linha reta ÷ velocidade média).
- Ao entrar no raio (padrão 2 km), quem tem permissão de check-in recebe um aviso com som.
  As filas da operação mostram "1,8 km · ~4 min".
- A posição é enviada a cada 15 s (ou antes, se o cliente andar mais de 100 m). A página tenta manter
  a tela ligada; se o cliente bloquear o celular, o envio para até ele voltar à página.
- **Privacidade:** só com a autorização do cliente, só no dia da retirada, só para a equipe. A posição é
  apagada no check-in, cancelamento, não comparecimento ou conclusão (gatilho no banco) e após 6 horas.
  O cliente pode tocar em **Parar** a qualquer momento.
- **Local do CD:** definido no próprio mapa (localização atual, clique no mapa ou busca de endereço).
  Em Configurações: ligar/desligar o recurso e o raio do alerta.
- **Simular (demonstração):** em "Aguardando hoje", faz um cliente percorrer ~6 km até o CD em cerca de
  1 min e meio, pelo mesmo caminho do celular real.
- Supabase: tabela `dt_rastreio` (só leitura para quem faz check-in / vê dashboard; anônimo sem acesso),
  funções `dt_enviar_localizacao` e `dt_parar_localizacao` (pelo código de acompanhamento).
- Mapa: Leaflet (licença BSD-2, em `js/vendor/`) com mapas do OpenStreetMap. Para alto volume, usar
  um provedor de mapas contratado.

## Aparência (layout personalizável)

Em **Configurações › Aparência (layout)** o administrador ajusta, com prévia ao vivo:

- **Logo da empresa** (PNG, JPG, WEBP ou SVG; ajustada para até 640 × 240 px). Aparece no menu, no
  login, na página do cliente e nos relatórios em PDF. "Usar logo padrão" volta à logo do projeto.
- **Menu lateral:** fundo, texto e destaque (item ativo e contadores).
- **Botões:** cor principal; o texto (branco ou escuro) é escolhido automaticamente pelo contraste.
- **Tela de login:** fundo e cor de destaque da apresentação, título, palavra em destaque, texto de
  apresentação, título e texto do quadro de acesso, e opção de mostrar as 8 etapas.

Avisos de contraste aparecem quando alguma combinação fica difícil de ler. "Restaurar padrão Condor"
volta tudo ao original. A alteração vale para todos os usuários (tempo real) e fica na Auditoria.
Fica gravada em `dt_config` (chave `aparencia`) e é lida sem login pela função pública
`dt_aparencia()`, porque a tela de login e a página do cliente aparecem antes de qualquer acesso;
uma cópia fica no navegador para a tela já abrir com o visual certo. Código: `js/aparencia.js`.

## Novidades da versão 0.9.0

A versão anterior (0.8.2) continua guardada: no ramo `versao-0.8.2` do GitHub e publicada em
`/v0.8.2/` (mesmo banco de dados).

**Configurações em abas** — Operação, Integração ERP, Separação, Avisos e resumo, Aparência,
Segurança e dados e Saúde. Quase tudo abaixo é ligado ou ajustado por lá.

| Recurso | Onde fica | Configuração |
|---|---|---|
| Regras por perfil no servidor (quem pode mudar cada status) | gatilho `dt_agendamento_regras` | — |
| Limite de tentativas na consulta do cliente sem o link (5 por pedido / 20 por IP em 15 min) | função `dt_acompanhar_pedido` | — |
| Retenção de dados (LGPD): apaga finalizados e auditoria antigos, 1×/dia | Segurança e dados | prazos em meses |
| Checklist para operação real (usuários e dados de demonstração, ERP, DPO, contas, plano) | Segurança e dados | — |
| Itens na ordem da rota do CD (Rua → Prédio → Nível → Apto) | Modo coletor e romaneio | liga/desliga |
| Romaneio A4 e etiqueta 10×15 com código de barras do pedido (Code 128) | Preparação, agenda e coletor | formato padrão |
| Fila de gravação persistente (bipes e alterações sem internet são reenviados) | automático | — |
| Check-in pelo QR do cliente (câmera ou leitor) | Check-in › Ler QR | QR na página do cliente |
| Painel de TV (chamada para a doca, aguardando, próximos horários) | Operação › Painel de TV | nome, placa, tempo de chamada |
| Avisos pelo WhatsApp: confirmação, pronto e lembrete | Avisos e resumo | desligado / link / webhook |
| Resumo diário por e-mail (via webhook) | Avisos e resumo | horário e destinatários |
| Relatórios: Separação e conferência, Divergências por produto, Metas de prazo | Relatórios | — |
| Metas de prazo no Dashboard | Dashboard | metas em Operação |
| Registro de erros das telas e falhas do ERP + aviso ao administrador | Saúde | — |
| Testes automáticos no GitHub | `tests/` e `.github/workflows/testes.yml` | — |

**Instalação no servidor:** rodar `supabase/migracoes/0.9.0.sql` uma vez no SQL Editor do Supabase e
publicar a função `dt-avisos` (`supabase/functions/dt-avisos`, com verificação de JWT).

**Webhook de avisos:** o servidor faz `POST` em JSON para o endereço configurado, com o cabeçalho
`X-DriveThru-Token` (guardado no cofre). Corpo dos avisos:
`{ evento: "confirmacao" | "pronto" | "lembrete" | "teste", mensagem, telefone, cliente, pedido, data, hora, link, unidade, enviadoEm }`.
Resumo diário: `{ evento: "resumo_diario", destinatarios: [...], assunto, texto, html, indicadores, dia }`.
No n8n, um fluxo "Webhook → WhatsApp (ou e-mail)" basta para fazer o envio.

## Regras implementadas

- Antecedência mínima de 1 hora (configurável).
- Capacidade por janela configurável (padrão: 20 janelas de 30 min, 1 pedido por janela = 2/hora).
- Janela lotada → mostra os próximos horários livres.
- Pedido inexistente, já agendado (mostra data, hora, status e quem agendou) e não elegível.
- Atendimento só inicia com o pedido **pronto** (separado, conferido e faturado).
- Limite de veículos simultâneos e bloqueio de doca ocupada.
- Reagendamento libera a janela anterior, exige motivo e mantém o histórico.
- Cancelamento exige motivo; nada é apagado.
- Alertas: preparação pendente, preparação crítica, cliente adiantado, atendimento atrasado,
  cliente atrasado, não comparecimento, cliente aguardando pedido não pronto.
- Tempos: espera, atendimento, total e chegada x agendado.

## Estrutura

```
index.html
css/style.css            tema claro/escuro, componentes, responsivo
js/config.js             parâmetros padrão, status, permissões, menu, ERP_CONFIG
js/utils.js              datas, formatação, hash de senha, CSV
js/relatorio-pdf.js      exportação dos relatórios em PDF (logo Condor, resumo, gráfico e tabela)
img/logo-condor.png      logo da empresa (PNG transparente, letras brancas — usar sobre fundo escuro)
js/storage.js            camada de dados (memória + localStorage no modo local)
js/nuvem.js              Supabase: login, carga, gravação e tempo real
js/lgpd.js               termo LGPD exibido após o login (texto e aceite)
js/rastreio.js           cliente a caminho: distância, previsão, alerta e simulação
js/aparencia.js          aparência personalizável (logo, cores do menu e dos botões, login)
js/views-mapa.js         tela Mapa de chegadas
js/vendor/               bibliotecas incluídas (supabase-js, QR Code, jsPDF e jsPDF-AutoTable: MIT; Leaflet: BSD-2)
js/erp.js                integração com ERP (hoje: base simulada)
js/services.js           regras de negócio, alertas e indicadores
js/seed.js               usuários iniciais e dados de demonstração
js/ui.js                 ícones, modais, toasts, componentes
js/views-*.js            telas por área (comercial, operação, gestão, admin)
js/painel.js             painel de TV (#painel)
js/impressao.js          romaneio de separação e etiqueta com código de barras
js/leitor-qr.js          leitura do QR de chegada pela câmera
js/avisos.js             avisos pelo WhatsApp e resumo diário (configuração e envio)
js/seguranca.js          retenção (LGPD), checklist de produção, atualização de perfis
js/monitor.js            registro de erros e saúde do sistema
tests/teste_fumaca.py    teste automático (roda no GitHub a cada envio)
js/app.js                login, layout, rotas, atualização automática
img/responsavel.jpg      foto do responsável pelo projeto (barra superior)
supabase/schema.sql      estrutura completa do banco (tabelas, regras de acesso, funções, gatilho)
supabase/functions/      funções de servidor: dt-usuarios, dt-erp, dt-erp-demo e dt-avisos
supabase/migracoes/      atualizações do banco por versão (rodar no SQL Editor)
supabase/README.md       como instalar o banco em um projeto Supabase novo
```

## Próximos passos para produção

1. **Contas da empresa**: publicar o site em domínio próprio e recriar o banco em uma conta Supabase
   corporativa seguindo `supabase/README.md`; depois, atualizar `DT.SUPABASE` em `js/config.js`.
2. **ERP**: ligar pelo assistente em Configurações › Integração ERP (endereço HTTPS, credencial e de-para).
3. **Regras por perfil no servidor**: feito na 0.9.0 (gatilho `dt_agendamento_regras`).
4. **Segurança**: seguir o checklist em Configurações › Segurança e dados (senhas, usuários de
   demonstração, termo LGPD validado pelo jurídico, plano pago do Supabase).
5. **Login corporativo (opcional)**: integrar com o AD/SSO da empresa pelo Supabase Auth.
6. Visão futura: aplicativo instalado para
   rastreamento com o celular bloqueado e previsão de chegada com trânsito.
