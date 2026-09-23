# BW-002 — Mercado Pago OAuth + Checkout Pro

Status: implementação para revisão e homologação. Não habilitar em produção antes dos testes com PostgreSQL e contas de teste do Mercado Pago.

## Comportamento

O proprietário conecta a própria conta em Configurações do admin. A aplicação usa OAuth com PKCE, state de uso único vinculado à sessão e à loja e callback central. Tokens ficam criptografados com AES-256-GCM, vinculados à loja, exclusivamente no servidor. A renovação usa bloqueio de linha para evitar duas rotações simultâneas do refresh token.

Depois da conexão, o lojista ativa Checkout Pro. O comprador é encaminhado para o checkout hospedado no Mercado Pago; a preferência utiliza o token do lojista, sem comissão da plataforma. O retorno do navegador não confirma pagamento. A confirmação consulta a API após validar a assinatura do webhook, conferindo loja, recebedor, referência, ambiente, moeda e valor.

Reserva de estoque, pedido e itens são transacionais. Repetir a mesma tentativa devolve o mesmo pedido. Aprovações repetidas não geram nova baixa, notificação ou trabalho de email. Emails usam uma fila persistente; uma falha entre enviar e registrar o envio ainda pode gerar email repetido. Não há promessa de entrega exatamente uma vez por um serviço externo.

O checkout legado permanece disponível nas lojas que não ativarem o novo provedor. Login continua exclusivamente conforme a configuração Google existente.

## Configuração

Configure no servidor, sem prefixo NEXT_PUBLIC para segredos:

| Variável                  | Uso                                                       |
| ------------------------- | --------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`     | Origem central HTTPS, por exemplo `https://exemplo.com`   |
| `MP_CHECKOUT_ENABLED`     | `false` por padrão; `true` libera conexão e ativação      |
| `MP_CLIENT_ID`            | ID da aplicação Mercado Pago da plataforma                |
| `MP_CLIENT_SECRET`        | Segredo da aplicação                                      |
| `MP_TOKEN_ENCRYPTION_KEY` | 32 bytes em hexadecimal; gerar com `openssl rand -hex 32` |
| `MP_WEBHOOK_SECRET`       | Segredo de assinatura de notificações da aplicação        |
| `MP_TEST_MODE`            | `true` para homologação; `false` para produção            |
| `MP_RECONCILE_SECRET`     | Segredo independente e aleatório para o agendador         |

Preserve a chave de criptografia em cofre e backup. Trocar a chave sem recriptografar os registros impede recuperar os tokens existentes. Não cole segredos em issues, PRs ou mensagens.

Na aplicação Mercado Pago configure a integração marketplace/Checkout Pro, PKCE e o callback exato `https://exemplo.com/api/mercadopago/oauth/callback`. A autorização deve incluir `offline_access`. Os subdomínios das lojas e o domínio central precisam compartilhar a sessão existente do Bewear, com HTTPS e cookies configurados adequadamente. Confirme isso em staging.

O webhook de cada preferência é `/api/mercadopago/checkout-webhook?storeId=<uuid>`, no domínio central. Configure eventos de pagamento e o segredo correspondente no Mercado Pago. As rotas antigas continuam exclusivas para pedidos legados.

Agende um POST autenticado em `/api/mercadopago/reconcile`, com `Authorization: Bearer <MP_RECONCILE_SECRET>`, por exemplo a cada minuto. O endpoint concilia um pedido pendente por execução e entrega até dois emails. Dimensione um worker dedicado antes de aumentar volume; a execução serverless tem duração limitada. O agendador não é provisionado por esta branch. O admin também oferece conciliação manual.

## Migração

Faça backup e ensaie em uma cópia do banco. A migração `drizzle/0008_mercadopago_oauth.sql` adiciona as tabelas OAuth, tentativas de checkout e fila de emails, além do provedor em loja/pedido. Valores padrão mantêm lojas e pedidos existentes no fluxo legado.

Há divergência anterior à BW-002: o journal referencia `0001_flowery_malcolm_colcord.sql`, ausente no repositório. Não execute a cadeia inteira de migrações sem reconciliar seu histórico com o banco. A migração 0008 tolera `terms_accepted_at` já existente, mas não é integralmente idempotente. Use o processo de migração do ambiente e registre a versão aplicada; não use `db:push` em produção como substituto dessa revisão.

## Como testar

1. Execute `npm ci`, `npm run typecheck` e `npm run test:payments`. A suíte de integração exige `TEST_DATABASE_URL` apontando para PostgreSQL descartável com o schema atual; sem isso ela fica explicitamente ignorada. Não aponte para produção.
2. Em staging, conecte duas lojas com vendedores de teste diferentes. Recuse uma autorização; repita um callback consumido; tente usar state em outra sessão. As tentativas devem ser rejeitadas sem mudar a conta conectada.
3. Verifique que HTML, props, logs e respostas nunca expõem tokens. Force a expiração do token apenas no banco de teste e execute solicitações simultâneas para testar renovação.
4. Com uma unidade disponível, faça duas compras concorrentes. Apenas uma reserva deve ser criada. Repita a mesma chave de tentativa: o pedido e a reserva devem permanecer únicos. Teste variante e endereço pertencentes a outros usuários/lojas.
5. Confirme no Checkout Pro que o recebedor é o vendedor correto. Teste aprovação, rejeição, pagamento pendente e retorno falsificado com query de sucesso: somente o estado confirmado no servidor pode marcar o pedido pago.
6. Reenvie webhook válido e execute conciliação simultânea. Confira um pedido pago, uma notificação inicial e dois trabalhos de email. Altere assinatura, recebedor ou valor: nenhum deles pode aprovar pedido incompatível.
7. Simule timeout na criação da preferência. A tentativa fica para revisão; a conciliação tenta recuperar uma preferência existente por referência, sem criar automaticamente outra cobrança.
8. Teste preferência expirada com pagamento ainda pendente: o cancelamento deve ser bloqueado. Somente após consulta remota confirmar ausência de pagamento ativo o lojista pode cancelar e liberar a reserva. Pagamento tardio vira revisão.
9. Teste estorno/chargeback, desconexão e reconexão com a mesma conta; pedidos históricos devem continuar consultáveis enquanto a autorização for válida. Revogação remota exige reconexão.
10. Valide o agendador e os emails, além de compra legada em uma loja que não ativou Checkout Pro.

## Limites e decisões desta entrega

- Desconto exclusivo de Pix deve estar zerado para ativar Checkout Pro: o meio é escolhido no checkout externo.
- Desconectar no Bewear desativa vendas online e preserva tokens criptografados para conciliar histórico. Revogação da autorização é feita no Mercado Pago. A UI explica essa distinção.
- Não é permitida troca de recebedor/ambiente quando já existe histórico neste fluxo; requer projeto de versionamento das conexões.
- Reservas expiradas exigem revisão/cancelamento explícito. Não há liberação por tempo que possa ignorar um Pix pendente.
- Estorno e chargeback geram revisão financeira; não devolvem estoque automaticamente nem desfazem uma entrega.
- Timeout de preferência sem resultado recuperável exige investigação. Muitas tentativas de pagamento podem exigir worker de conciliação com paginação e orçamento de execução maior.
- Aprovações após cancelamento e múltiplos pagamentos aprovados exigem revisão humana e eventual reembolso no Mercado Pago.

## Evidências locais

TypeScript e lint dos arquivos alterados passaram. O build não concluiu: falha TLS ao baixar Poppins do Google Fonts neste ambiente. Seis testes de unidade passaram. O schema de 19 tabelas e a aplicação da migração 0008 foram verificados com PGlite. Isso não substitui testes de concorrência em PostgreSQL real. A suíte PostgreSQL foi criada, mas não executada por falta de um banco de teste configurado. OAuth, checkout e notificações reais ainda precisam de homologação.

Referências oficiais: [OAuth](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation), [Checkout Pro marketplace](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/how-tos/integrate-marketplace), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks).
