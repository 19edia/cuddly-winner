# Cópia acompanhada de tutorial para Render Free

Para instalação gratuita, leia primeiro TUTORIAL.html no pacote do tutorial. A configuração de deploy desta cópia usa Free. Esta versão adiciona preflight obrigatório antes da porta HTTP e assistente offline para gerar .env.

# IFJ Central — painel + bot Discord

Projeto completo em Node.js, Express, discord.js e PostgreSQL. Hospedagem: Render. Banco recomendado: Supabase PostgreSQL.

## O que está implementado

- Login por usuário e senha; sessões no banco, cookie HttpOnly, SameSite, HTTPS em produção, proteção de origem/CSRF e limite de tentativas.
- Administrador cria, desativa, redefine senha e altera a patente de outros logins. Cada usuário pode mudar a própria senha.
- Administrador: gestão completa. Moderador: cria, edita e exclui IFJs e gera PNGs. Recrutador: cria IFJs de membros ou aliados e consulta os que criou. Não existe cadastro público.
- IFJ único com exatamente 15 dígitos, inclusive zeros iniciais; nome da pessoa, nick no jogo, usuário Roblox, ID Discord e divisão. Código excluído não é reutilizado.
- Duas divisões em dois servidores; IFJ de membro sem patente de acesso duplo em outra divisão não libera o cargo. Aliados verificados acessam ambas as divisões. ID Discord pré-cadastrado impede uso de IFJ alheio.
- Botão de verificação abre formulário; resposta privada mostra nome, nick no jogo, usuário Roblox, divisão e dados da aliança; confirmação válida por cinco minutos; acesso liberado por cargo.
- Caçados: formulário no painel com nick, motivo, descrição e divisão; embed **VIVO OU MORTO**. Publicação manual, uma vez a cada envio. Pode cadastrar novos caçados a cada dia.
- Exclusão de IFJ: remove cadastro, invalida confirmações pendentes e coloca remoção de cargo na fila. Administrador pode publicar cancelamento com motivo no canal de caçados/anúncios.
- Tickets privados para membro e administradores. Botão **Fechar — resolvido** e fechamento pelo painel; canal removido e registro preservado.
- Denúncia: formulário com nome no jogo/usuário Roblox/IFJ e motivo. Não encontrado: **IFJ não encontrado**, privado. Encontrado: marca suspeito, guarda denúncia e responde **Obrigado, vamos analisar**, privado.
- Administrador consulta denúncia, conversa com o membro e registra a conclusão; suspeita sai quando não há denúncias pendentes. Sem punição automática.
- Fila persistente de ações Discord com novas tentativas e acompanhamento no painel. Auditoria de operações administrativas.

O código está implementado, mas não foi publicado em uma conta Render nem conectado a servidores Discord reais nesta entrega. Tokens, banco e canais devem ser configurados pelo dono.

## 1. Criar o banco gratuito

1. Crie um projeto no [Supabase](https://supabase.com/).
2. Em **Connect**, copie a conexão PostgreSQL. Prefira o **Session pooler** quando a conexão direta IPv6 não for compatível com sua rede. Copie host, usuário e porta exatamente como fornecidos.
3. Substitua a senha da conexão pela senha do banco, com caracteres especiais codificados para URL.
4. Use a URL em `DATABASE_URL`, com TLS validado (`sslmode=verify-full`). Se a conexão exigir uma CA específica, configure a CA oficial do provedor; não desative a validação TLS.
5. Use a conta proprietária do banco para criar o esquema e acessar as tabelas. O aplicativo habilita RLS sem políticas públicas: as tabelas não ficam liberadas ao cliente REST anônimo do Supabase.

As tabelas são criadas automaticamente na primeira inicialização. Não coloque `DATABASE_URL`, token do Discord nem senha de administrador no HTML ou em repositório público. O plano gratuito tem limites e pode pausar por inatividade; consulte [preços e limites](https://supabase.com/pricing).

## 2. Preparar o Discord

1. Crie uma aplicação em [Discord Developer Portal](https://discord.com/developers/applications), entre em **Bot** e gere o token.
2. Convide **o mesmo bot** para os dois servidores. No gerador OAuth2, selecione o escopo `bot` e as permissões **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**, **Manage Roles** e **Manage Channels**. Não precisa conceder Administrator ao bot.
3. Este projeto usa Gateway e botões, sem slash commands. Não preencha Interactions Endpoint URL. Só utiliza o intent Guilds; não exige Message Content nem Server Members para os fluxos implementados.
4. Em cada servidor, crie um cargo de membros verificados e um cargo de administradores. O cargo do bot precisa ficar acima do cargo de membros verificados. O cargo de membro não pode ter Administrator.
5. Crie quatro canais: **verificação**, **caçados** (também anúncios/cancelamentos), **tickets** e **denúncias**; crie uma categoria para os tickets individuais. Os nomes são livres; o código usa os IDs.
6. Ative Modo Desenvolvedor no Discord para copiar os IDs dos servidores, cargos, canais e categoria.

### Permissões dos canais: etapa obrigatória

O bot libera acesso atribuindo o cargo; as permissões abaixo precisam estar configuradas no Discord para que isso tenha efeito:

- Nos canais/categorias restritos, **negue View Channel para @everyone** e permita para o cargo de membros daquela divisão, administradores e bot.
- Confira os canais filhos: sincronize com a categoria restrita ou configure as mesmas regras. Remova outros cargos/overwrites que deem acesso aos membros não verificados.
- Deixe o canal de verificação visível para @everyone e para o bot. Pode deixar o canal de abertura de tickets acessível a não verificados para suporte.
- Caçados e denúncias podem ficar acessíveis apenas aos verificados, conforme sua organização.
- O bot cria cada ticket com permissões explícitas privadas para solicitante, cargo administrativo e bot. Pessoas com Administrator no Discord sempre podem ver canais privados, conforme o comportamento do Discord.
- O sistema não impede uma pessoa de entrar no servidor por convite: controla o acesso aos canais via cargo. No servidor da divisão errada a pessoa não ganha o cargo, podendo ver somente os canais públicos de recepção.

Logins do site e cargos do Discord são coisas diferentes. Para fechar ticket no Discord, o atendente precisa do cargo `DIV_N_ADMIN_ROLE_ID` ou ser dono do servidor; para fechar pelo site, precisa da patente `admin`.

## 3. Publicar no Render

1. Extraia este ZIP e envie o conteúdo da pasta `ifj-central` para um repositório GitHub privado. Não envie `.env` nem `node_modules`.
2. No Render, crie um **Web Service** usando esse repositório (ou um Blueprint usando `render.yaml`).
3. Runtime: Node 22 ou superior. Build: `npm ci --omit=dev`. Start: `npm start`. Health check: `/health`.
4. Use **uma única instância**. Nesta cópia o Blueprint usa `free`, sujeito a suspensão e cotas. Siga TUTORIAL.html, na raiz do pacote, para o roteiro gratuito. Não há garantia de bot online 24 horas.
5. Configure as variáveis de ambiente abaixo. Em produção use `NODE_ENV=production` e `APP_ORIGIN=https://SEU-SERVICO.onrender.com`, sem barra final. O Render fornece `PORT` automaticamente.
6. Faça deploy, abra a URL, entre com o primeiro administrador e vá em **Bot e histórico → Publicar / atualizar botões**. A ação cria as mensagens de verificação, ticket e denúncia nos dois servidores; reexecutar atualiza as existentes.
7. Depois do primeiro login, remova `INITIAL_ADMIN_PASSWORD` e `INITIAL_ADMIN_USERNAME` do Render. O login já está no banco, com senha protegida por scrypt. Essas variáveis só são usadas quando o banco não tem nenhum login.
8. Crie os outros logins no painel. As credenciais desses usuários ficam no banco; não precisam virar variáveis Render.

O Web Service hospeda o painel e mantém o bot conectado no mesmo processo. Serviço gratuito do Render pode suspender por inatividade e não serve como garantia de bot online 24h; veja [limitações do plano gratuito](https://render.com/docs/free). Não use o PostgreSQL gratuito temporário do Render para guardar seus cadastros de forma permanente.

### Variáveis

Veja também `.env.example`. Tudo abaixo é configurado no Render, sem editar o HTML.

| Variável | Valor |
| --- | --- |
| `NODE_ENV` | `production` no Render |
| `APP_ORIGIN` | URL HTTPS pública do painel, sem barra final |
| `DATABASE_URL` | Conexão PostgreSQL do Supabase |
| `SESSION_SECRET` | Segredo aleatório de ao menos 32 caracteres; o Blueprint gera automaticamente |
| `INITIAL_ADMIN_USERNAME` | Primeiro login, somente no primeiro boot |
| `INITIAL_ADMIN_PASSWORD` | Senha inicial com pelo menos 12 caracteres, somente no primeiro boot |
| `BOT_ENABLED` | `true`; use `false` apenas para testar painel sem Discord |
| `DISCORD_TOKEN` | Token secreto do bot |
| `DIV_1_NAME`, `DIV_2_NAME` | Nomes das divisões |

Repita o conjunto abaixo para `N=1` e `N=2`:

| Variável | Valor |
| --- | --- |
| `DIV_N_GUILD_ID` | ID do servidor da divisão |
| `DIV_N_MEMBER_ROLE_ID` | ID do cargo liberado após verificação |
| `DIV_N_ADMIN_ROLE_ID` | ID do cargo de administradores que atende tickets |
| `DIV_N_VERIFICATION_CHANNEL_ID` | Canal do botão de verificação |
| `DIV_N_WANTED_CHANNEL_ID` | Canal de caçados e anúncios de cancelamento |
| `DIV_N_TICKETS_CHANNEL_ID` | Canal do botão de abertura de ticket |
| `DIV_N_REPORTS_CHANNEL_ID` | Canal do botão de denúncia |
| `DIV_N_TICKET_CATEGORY_ID` | Categoria dos tickets privados |
| `DIV_N_STAFF_CHANNEL_ID` | Opcional: canal de aviso de nova denúncia; os detalhes ficam no painel |

Se quiser gerar um segredo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 4. Uso diário

1. Administrador ou recrutador cadastra nome, nick, usuário Roblox, ID Discord e divisão no painel. Moderador também pode cadastrar.
2. Copie o IFJ gerado e entregue em particular ao membro. Não publique listas de IFJs nos canais.
3. Membro entra no servidor correspondente, clica **Verificar meu IFJ**, informa o código e confirma os dois nomes. Só o Discord cadastrado consegue concluir.
4. A fila libera o cargo em poucos segundos. Se falhar, o administrador vê a operação em **Bot e histórico**, corrige as permissões e tenta novamente.
5. Denúncias marcam suspeita sem remover automaticamente o cargo. O administrador vê o ID Discord do membro para conversar e registra o resultado no painel.
6. Excluir um IFJ invalida o código imediatamente no banco. A remoção de cargo depende de o Discord estar disponível e do bot ter permissão; confira a fila se o acesso persistir.
7. Para mudar divisão ou corrigir um cadastro, exclua o IFJ e crie outro com os dados corretos. A pessoa deve verificar o novo IFJ. Recrutador solicita a exclusão a moderador/administrador.

Os anúncios de caçados são para o jogo/roleplay. Texto não gera menções automáticas de usuários, cargos ou @everyone.

## Desenvolvimento local

```sh
npm ci
cp .env.example .env
# Edite .env com as configurações reais. Para testar só o painel, BOT_ENABLED=false.
npm start
```

Abra `http://localhost:3000`. Nunca reutilize senhas de produção no ambiente de teste.

```sh
npm test
npm run check
```

Os testes usam PostgreSQL embarcado via PGlite (sem banco externo) e simulam chamadas Discord. Cobrem autenticação, CSRF, permissões das três patentes, IFJs duplicados, divisão incorreta, código roubado, confirmação, denúncia, análise, exclusão, fila de cargos e tickets privados. Não equivalem a uma validação em servidores Discord reais.

## Estrutura

- `public/`: login e painel responsivo, CSS e JavaScript.
- `src/app.js`: API, autenticação e permissões.
- `src/bot.js`: botões, modais, filas, cargos, anúncios e tickets.
- `src/schema.sql`: tabelas, índices, restrições e RLS.
- `src/db.js`, `config.js`, `security.js`: banco, configuração e proteção de credenciais.
- `src/server.js`: inicialização conjunta de painel e bot.
- `test/system.test.js`: testes automatizados.
- `render.yaml`: configuração de deploy.

## Limites operacionais desta versão

- Um processo/instância do serviço. Não habilite autoscaling sem revisar limites de tentativas e o processamento de sessões Gateway.
- O painel lista os 1.000 membros e denúncias mais recentes, 500 tickets e 100 ações recentes. Históricos completos continuam no banco.
- Retentativas Discord são limitadas a oito; operações com falha ficam visíveis e podem ser reenviadas. Em falhas raras após envio e antes da confirmação no banco, um anúncio pode se repetir; o nonce do Discord reduz duplicatas recentes, sem prometer entrega exatamente uma vez.
- Fechar ticket remove o canal; não arquiva a transcrição. O registro de abertura, responsável pelo fechamento e situação é preservado.
- O código não comprova propriedade da conta Roblox por OAuth: o administrador cadastra o usuário Roblox e o ID Discord, e o bot confirma esse vínculo cadastrado.
- Não há recuperação de senha por email. Outro administrador pode redefinir a senha. Preserve com cuidado o acesso do primeiro administrador e os backups do banco.

Referências oficiais: [Discord — interações](https://docs.discord.com/developers/interactions/receiving-and-responding), [Render — Blueprint](https://render.com/docs/blueprint-spec), [Supabase — planos](https://supabase.com/pricing).


## Inicialização com bloqueio (nova versão)

`npm start` agora testa variáveis, sistema, arquivos, hash, permissões, PostgreSQL (incluindo escrita com rollback), esquema, administrador ativo e, com BOT_ENABLED=true, autenticação e configuração real do Discord. O HTTP e a fila do bot só são ativados depois da aprovação. Qualquer erro encerra com código 1; nenhuma senha/token é exibida. Há limite global de 120 segundos. O Render pode reiniciar o processo, que continuará bloqueado até a correção.

BOT_ENABLED=false inicia apenas o painel e registra os testes Discord como dispensados. O preflight do Discord é de consulta: não envia mensagens de teste. Ele verifica os canais configurados, mas a visibilidade de todos os canais restritos deve ser conferida manualmente com uma conta comum.

Abra ASSISTENTE.html no pacote de tutorial: ele pede cada valor e grava .env a cada avanço no arquivo que você escolher, quando o navegador suporta essa função. Em outros navegadores, baixe o arquivo ao final. O .env só chega ao Render quando você o importa; não há deploy automático pelo assistente. `configurar.invalid` não é mais aceito: copie a URL real do serviço antes de tentar iniciar.

Novos arquivos: src/preflight.js, src/config-rules.js, src/discord-checks.js, src/env-codec.js e test/preflight.test.js.

## Atualização: alianças e identidades

Leia a seção **Alianças e carteiras PNG** do TUTORIAL.html incluído no ZIP.

- Todos os três cargos criam IFJs de membros e alianças. Gang obrigatória para aliados.
- Apenas admin/moderador configuram cadastros, patentes no jogo e geram PNGs. A patente no jogo não altera permissões do painel.
- PATCH /api/members/:id exige identity_version atual; conflito retorna 409. IFJ não muda na edição.
- GET /api/members/:id/card.png exige sessão de admin/moderador, com limite de emissão e Cache-Control no-store.
- Mudança nos dados de identidade reinicia verificação e enfileira remoção dos acessos. Confirmar dados antigos não concede acesso.
- Migração automática preserva registros antigos; fontes empacotadas e @napi-rs/canvas geram PNGs sem serviços pagos. Nenhuma variável nova.
- Preflight gera PNG antes de abrir HTTP; uma falha obrigatória encerra o processo.

Testes: npm ci e npm test. Integrações usam PostgreSQL local em memória (PGlite) e Discord simulado; a conexão com seu Discord/Supabase real é conferida pelo preflight após configurar o ambiente.

### Acesso de aliados às duas divisões

Aliados podem verificar em qualquer um dos dois servidores, sempre com o ID Discord cadastrado. A confirmação sincroniza o cargo de acesso nos dois servidores em que a pessoa já está presente. Se entrar no outro servidor posteriormente, verifica novamente com o mesmo IFJ. Membros sem patente de acesso duplo permanecem restritos à divisão cadastrada. Para aliados, a divisão salva serve de referência administrativa/encaminhamento de denúncias. Após atualizar, peça aos aliados existentes que verifiquem novamente para sincronizar os cargos. Não há variáveis novas nem mudança de esquema nesta atualização.

## /criar e patentes de acesso duplo

Líder, Sub líder e High member acessam ambos os servidores, assim como aliados. Regra central em src/identity.js. Somente admin/moderador configuram a patente; mudança de alcance reinicia verificação e enfileira revogação.

Para preparar servidores sem canais, use temporariamente `npm run configurar`. Exige DISCORD_TOKEN e DIV_1_GUILD_ID / DIV_2_GUILD_ID distintos. O instalador testa Discord e permissões antes de abrir a página de estado, sem iniciar banco ou painel. Execute `/criar servidor:<servidor> divisao:<divisão>` no próprio servidor, como dono ou Administrator do Discord. Repita no segundo servidor.

Importe os dois anexos .env de IDs no Render, complete as variáveis do aplicativo e volte a `npm start`. Publique os botões pelo painel. O comando continua disponível no modo normal.

O comando monta 8 categorias, 24 canais de texto, 6 calls e 10 cargos por servidor; recursos marcados IFJ são reutilizados e suas permissões reaplicadas. Não remove outros canais. Execute uma única instância e preserve os marcadores. Instruções completas em TUTORIAL.html, seção /criar.

## Estrutura decorada

Modelo em src/server-layout.js: primeira divisão verde e segunda azul, com emojis, categorias de operações, treinamento, convivência e comando. /criar preserva recursos antigos identificados e retorna um .env dos IDs utilizados, mais inventário TXT de todos os IDs. Cargos extras de patente são visuais e manuais; a fonte de autorização entre divisões continua sendo a patente no cadastro IFJ. A atualização respeita o ID de cargos configurados e não altera suas permissões globais.
