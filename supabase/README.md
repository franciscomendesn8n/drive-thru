# Banco de dados (Supabase) — instalação em um projeto novo

Esta pasta recria o banco de dados do Drive Thru em uma conta Supabase da empresa.
Nenhum arquivo aqui contém dados, senhas ou chaves secretas.

| Arquivo | O que é |
|---|---|
| `schema.sql` | Tabelas, índices, regras de acesso (RLS), funções, gatilho e tempo real |
| `functions/dt-usuarios/index.ts` | Função de servidor que cria e altera usuários e senhas |
| `functions/dt-erp/` (`index.ts` + `erp-nucleo.js`) | Função de servidor que consulta pedidos no ERP e guarda a credencial no cofre |
| `functions/dt-erp-demo/index.ts` | "ERP de demonstração" — API de teste com pedidos fictícios (opcional) |

## Passo a passo

1. **Criar o projeto** no Supabase (região *South America — São Paulo*).
2. **Banco:** em *SQL Editor*, cole o conteúdo de `schema.sql` e clique em *Run*.
3. **Função de usuários:** publique `functions/dt-usuarios` com o nome **dt-usuarios**
   (painel *Edge Functions › Deploy a new function*, ou `supabase functions deploy dt-usuarios`).
   Mantenha a verificação de JWT ligada. A chave de serviço é fornecida pelo próprio Supabase.
   Publique também **dt-erp** (pasta `functions/dt-erp`, com os dois arquivos; JWT ligado) e, se quiser
   o ERP de demonstração, **dt-erp-demo** (JWT **desligado** — ele tem a própria chave de teste).
4. **Login (Authentication):**
   - *Sign In / Providers › Email*: ligado; **desligue "Allow new users to sign up"** (usuários são criados só pelo administrador) e desligue a confirmação por e-mail.
   - *Password requirements*: mínimo de 8 caracteres, com minúscula, maiúscula, número e símbolo (mesma regra do aplicativo).
   - A proteção contra senhas vazadas existe a partir do plano Pro.
5. **Primeiro administrador:**
   - *Authentication › Users › Add user*: e-mail `admin@drivethru.app`, uma senha forte, marcar *Auto Confirm User*.
   - Copie o *UID* do usuário criado e rode no *SQL Editor*:
     ```sql
     insert into public.dt_usuarios (id, login, nome, perfil)
     values ('COLE-O-UID-AQUI', 'admin', 'Nome do Administrador', 'admin');
     ```
6. **Ligar o aplicativo ao banco:** em `js/config.js`, preencha `DT.SUPABASE.url` e `DT.SUPABASE.chave`
   com a *Project URL* e a chave **publicável** (*Settings › API Keys › Publishable key*).
   Nunca coloque a chave *secret / service_role* no aplicativo.
7. **Primeiro acesso:** entre com o administrador. Com o banco vazio, o sistema carrega dados de
   demonstração. Para operar de verdade: *Configurações › Começar operação real*, depois cadastre
   funcionários e usuários em *Usuários e perfis* e marque o local do CD no *Mapa de chegadas*.

## Como os logins funcionam

O usuário digita só o login (ex.: `joao.silva`); o aplicativo entra no Supabase como
`joao.silva@drivethru.app`. O domínio fica em `DT.SUPABASE.dominioLogin` (`js/config.js`) e em
`DOMINIO` (`functions/dt-usuarios/index.ts`) — os dois precisam ser iguais.

## Regras de acesso (resumo)

- Visitante sem login: não lê nenhuma tabela; só usa as funções da página do cliente
  (`dt_acompanhar`, `dt_acompanhar_pedido`, `dt_enviar_localizacao`, `dt_parar_localizacao`),
  que exigem o código de acompanhamento e devolvem apenas dados não sensíveis.
- Usuário ativo: lê e grava agendamentos e inclui registros de auditoria.
- Configurações, funcionários e exclusões: só com a permissão correspondente do perfil.
- Localização do cliente: lida só por quem faz check-in ou vê o dashboard; apagada no check-in,
  cancelamento, não comparecimento, conclusão ou após 6 horas.

O script foi testado em um PostgreSQL limpo e reproduz a estrutura do projeto em uso em 30/09/2026.

## Integração com o ERP (Configurações › Integração com o ERP)

O administrador liga o ERP sem mexer no código, em 6 passos:

1. **Conexão** — endereço HTTPS da API que devolve um pedido, com `{numero}` no lugar do número
   (ex.: `https://erp.empresa.com.br/api/pedidos/{numero}`), tipo de autenticação e tempo máximo.
2. **Credencial** — chave, token ou `usuario:senha`. Vai direto para o cofre (Vault), criptografada;
   nunca volta para a tela nem fica no navegador.
3. **Resposta do ERP** — consulta um pedido real (ou cola um exemplo em JSON) e indica onde está o pedido.
4. **Campos (de-para)** — liga cada informação do Drive Thru ao campo do ERP, com sugestão automática
   e o valor do exemplo ao lado.
5. **Regras** — situações que bloqueiam, tipos de entrega aceitos e valores que indicam "faturado".
6. **Testar e ativar** — teste no ERP pelo servidor; só depois de um teste bem-sucedido é possível ativar.
   Dá para desativar a qualquer momento (o agendamento volta à base de demonstração).

Requisitos da TI: a API do ERP precisa responder em **HTTPS pela internet** (endereços internos são
bloqueados). Se o ERP só existe na rede interna, publique um serviço intermediário com HTTPS e
liberação apenas dos IPs do Supabase.

**ERP de demonstração:** em *Conexão*, clique em "Preencher com o ERP de demonstração" e, em *Credencial*,
em "Usar a chave do ERP de demonstração". Pedidos: 130004 a 130013 (liberados), 140001 (cancelado),
140002 (entrega, não é retirada) e 140003 (já faturado, NF 456789).

> O arquivo `js/erp-nucleo.js` (aplicativo) e `functions/dt-erp/erp-nucleo.js` (servidor) devem ser
> **idênticos** — ao alterar um, copie para o outro e publique a função dt-erp de novo.

## Separação e conferência (Configurações › Separação e conferência)

Somente o perfil **Administrador** escolhe o modo de trabalho; a escolha vale para todos na hora.

| Modo | Como as etapas Em preparação → Separado → Conferido são registradas |
|---|---|
| Manual (como hoje) | Botões na tela Preparação |
| Status vindo do ERP / WMS | O servidor (função dt-erp, ação `sincronizarSeparacao`) lê no ERP, a cada minuto, a etapa dos pedidos do dia. Informe o campo e os valores de cada etapa. Só avança, nunca volta |
| Coletor — conferência item a item | Tela **Modo coletor**: bipa o pedido e cada produto (EAN ou código), na separação e na conferência. Opções: conferente diferente de quem separou; finalizar com divergência (com motivo) |
| Coletor — bipe do pedido | Tela **Modo coletor**: cada bipe do pedido avança uma etapa; bipe repetido em poucos segundos é ignorado; o último bipe pode ser desfeito em até 2 minutos |

- Permissão nova: **Operar o coletor** (`coletor.operar`) e perfil **Operador de coletor**, que só vê o Modo coletor.
- A seção 8 do `schema.sql` faz o servidor recusar a troca do modo por quem não é Administrador e
  inclui a permissão do coletor nos perfis de um banco já em uso. Rode-a no *SQL Editor* se o banco
  foi criado antes da versão 0.8.0.
- Faturamento e liberação para retirada continuam na tela Preparação nos modos de coletor.
