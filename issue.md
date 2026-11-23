# Comandô Backend — Pontos de revisão, melhoria e correção

> Análise estática do repositório em 2026-11-23 (complementada por auditorias paralelas de app, domínio, infraestrutura, testes, docs e operações).  
> Objetivo: listar problemas reais, inconsistências, débitos técnicos e oportunidades de simplificação para decisão antes de qualquer mudança.

---

## 1. Build / qualidade quebrada no estado atual

### 1.1 `bun run typecheck` falha
- **Arquivo:** `tsconfig.json`
- **Erro:** `Cannot find type definition file for 'bun-types'`
- **Causa:** `types: ["bun-types"]` não existe; o pacote correto é `"bun"` (exposto por `@types/bun`).
- **Impacto:** Pre-commit (`biome check --staged --write && bun run typecheck`) e CI de lint estão quebrados.
- **Ação provável:** Trocar `"types": ["bun-types"]` para `"types": ["bun"]`.

### 1.2 `tsconfig.json` inclui arquivo inexistente
- **Arquivo:** `tsconfig.json` linha 22 — `"biome.config.ts"` consta em `include`, mas o arquivo não existe.
- **Ação provável:** Remover essa entrada.

### 1.3 `bun run lint` falha
- **Arquivo:** `biome.json`
- **Erro 1:** Schema `https://biomejs.dev/schemas/2.6.4/schema.json` não bate com a CLI instalada `2.6.8`.
- **Erro 2:** Formatação divergente em `scripts/seed-root-entrypoint.ts` (parênteses em torno de `await tx`...`as unknown as`).
- **Impacto:** Hook pre-commit e CI de lint falham.
- **Ação provável:** Atualizar o `$schema` para `2.6.8` e rodar `bun run format`.

### 1.4 `.env.example` foi removido do working tree
- **Status git:** `D .env.example`
- **Impacto:** `README.md` e `AGENTS.md` apontam para `.env.example`; novos devs não têm modelo de variáveis.
- **Ação provável:** Restaurar o arquivo (`git checkout -- .env.example`) ou decidir conscientemente removê-lo e atualizar a documentação.

### 1.5 `pnpm-lock.yaml` não deveria existir
- **Status git:** untracked
- **Impacto:** O projeto usa `bun.lock`. Ter dois lockfiles é confuso e pode gerar builds diferentes entre Bun e pnpm.
- **Ação provável:** Remover `pnpm-lock.yaml` e adicioná-lo ao `.gitignore`.

### 1.6 Husky pre-commit está lento e bloqueante
- **Arquivo:** `.husky/pre-commit`
- **Problema:** Roda `bun run typecheck` em todo commit. Em mudanças grandes, isso desencoraja commits pequenos.
- **Ação provável:** Considerar mover typecheck para pre-push ou CI.

### 1.7 Pre-push gate é muito estreito
- **Arquivo:** `.husky/pre-push`
- **Problema:** Apenas `bun test tests/unit`; não roda lint, typecheck, integração ou e2e.
- **Ação provável:** Expandir o gate ou deixar CI como único gate completo.

---

## 2. Inconsistências entre documentação e código

### 2.1 `README.md` contradiz `ADR-02` sobre permissões de `ADMIN`
- **Local:** `README.md` linhas 23–25 (tabela de roles)
- **Problema:** README diz que `ADMIN` "Cannot open or edit tables". A tabela de permissões de `ADR-02` e o código (`src/domain/entity/role/index.ts`) não concedem `orders:open`/`orders:update` a `ADMIN`.
- **Impacto:** Documentação gera expectativa errada para clientes/QA.
- **Ação provável:** Alinhar README com `ADR-02` (ou vice-versa) e refletir no OpenAPI.

### 2.2 `AGENTS.md` desatualizado em relação aos ADRs
- **Local:** `AGENTS.md`, seção Domain rules
- **Problema 1:** Ainda diz "Both `CASHIER` and `SERVER` can close or cancel it". `ADR-02` removeu `orders:close` de `SERVER`.
- **Problema 2:** Afirma que há três estados (`OPEN`, `CLOSED`, `CANCELED`), omitindo `AWAITING_PAYMENT` introduzido por `ADR-01`.
- **Ação provável:** Atualizar `AGENTS.md` para refletir `ADR-01`/`ADR-02` como fonte de verdade.

### 2.3 Documentação de porta do PostgreSQL diverge do Docker Compose
- **Local:** `README.md` menciona `55432`; `infra/docker-compose.yml` expõe `5432:5432`.
- **Ação provável:** Escolher uma porta padrão e atualizar ambos.

### 2.4 `README.md` omite migration 002 na árvore do projeto
- **Local:** `README.md` linhas 307–311
- **Problema:** Lista apenas `001_initial_schema.up.sql/down.sql`. O repositório também contém `002_order_surcharge_discount.up.sql/down.sql`.
- **Ação provável:** Atualizar a árvore.

### 2.5 `infra/README.md` é ambíguo sobre qual `.env.example` copiar
- **Local:** `infra/README.md` linhas 19–30
- **Problema:** Diz "Copy `.env.example` to `.env`" sem especificar `infra/.env.example → infra/.env`.
- **Ação provável:** Deixar o caminho explícito.

### 2.6 DBML diverge da migration em ordem descendente de índices
- **Arquivo:** `docs/schema.dbml` linhas 112–113
- **Problema:** DBML mostra `orders_history_idx` como `(created_at, id)` e `orders_status_created_idx` como `(status, created_at, id)` sem `DESC`. A migration cria:
  - `orders_history_idx ON orders (created_at DESC, id DESC)`
  - `orders_status_created_idx ON orders (status, created_at DESC, id DESC)`
- **Ação provável:** Atualizar DBML ou adicionar nota esclarecedora.

### 2.7 DBML não reflete nome do campo `enabled` na API
- **Arquivo:** `docs/schema.dbml` linha 72
- **Problema:** Coluna do banco é `active`, mas corpo de request/response usa `enabled`. O domínio chama de `isEnabled`, enquanto `isActive` significa "não removido".
- **Ação provável:** Adicionar nota no DBML sobre o nome `enabled` na API.

---

## 3. Violações de regras do `AGENTS.md`

### 3.1 Comentários em português em script que deveria ser 100% inglês
- **Arquivo:** `scripts/seed-root-entrypoint.ts` linhas 1–4 e 22–23/36
- **Regra:** "All source code identifiers, filenames, comments, commit messages, pull request titles/descriptions, and technical documentation must be written in English."
- **Ação provável:** Traduzir os comentários para inglês.

### 3.2 Infraestrutura importa módulo de configuração
- **Arquivo:** `src/infrastructure/logging/json-logger.ts` linha 1
- **Problema:** `import type { LogLevel } from '@/app/config';` faz infraestrutura depender de configuração de ambiente.
- **Regra:** Domain/infrastructure não devem importar configuração que lê `process.env`.
- **Ação provável:** Mover `LogLevel` para `src/app/ports/logger.ts` ou para um tipo compartilhado em `src/app/ports`.

### 3.3 Domínio carrega validação de pedido de outro sub-módulo
- **Arquivo:** `src/domain/entity/settings/index.ts` linha 1
- **Problema:** `import { requireBasisPoints } from '@/domain/entity/order/pricing';` faz `Settings` depender de `order/pricing`.
- **Regra:** Evitar acoplamento entre entidades; regras compartilhadas podem ir em um utilitário de domínio.
- **Ação provável:** Extrair `requireBasisPoints` para `src/domain/entity/validation.ts` ou similar.

### 3.4 Use case da aplicação importa validador do domínio
- **Arquivo:** `src/app/use-cases/orders/open-table-order.ts` linha 8
- **Problema:** Importa `requireNonEmptyString` de `@/domain/entity/validation`. A camada de aplicação deve validar forma na borda HTTP e deixar o domínio impor invariantes.
- **Ação provável:** Remover a importação e confiar no schema HTTP / na validação do domínio.

---

## 4. Problemas de arquitetura / design

### 4.1 Scripts de bootstrap bypassam o domínio
- **Arquivos:** `scripts/create-admin.ts`, `scripts/seed-root-entrypoint.ts`
- **Problema:** Criam usuários diretamente via SQL/repositório sem usar `User.create`, sem validar e-mail, roles, etc.
- **Risco:** Se a regra de validação do domínio mudar, os scripts podem inserir dados inválidos.
- **Ação provável:** Refatorar para usar `User.create` e repositories através do container (onde viável) ou duplicar validação explicitamente testada.

### 4.2 Validação duplicada entre HTTP schemas e use cases
- **Exemplos:**
  - `AddOrderItemsUseCase` revalida `lines.length === 0` (já exigido por `addOrderItemsBodySchema`).
  - `SetOrderPricingUseCase` revalida presença de campos (já exigido por `setOrderPricingBodySchema`).
  - `ListOrdersUseCase` revalida `status`, `type` e `statuses` (já exigido pelos schemas).
  - `tableCode` é validado em HTTP schema, use case e domínio.
  - Paginação é validada em HTTP schemas e novamente em `requirePage`/`requirePageSize`.
- **Risco:** Divergência futura; código maior que o necessário.
- **Ação provável:** Manter a validação de forma na borda HTTP; nos use cases, confiar nos tipos e apenas aplicar regras de domínio/negócio.

### 4.3 `Money.format` usa aritmética de ponto flutuante
- **Arquivo:** `src/domain/value-objects/money.ts` linhas 52–59
- **Problema:** `this.props / 100` viola a regra "Never use floating-point arithmetic for money", mesmo que apenas para exibição.
- **Ação provável:** Usar `Intl.NumberFormat` com `minimumFractionDigits` formatando os centésimos como string/inteiro, sem divisão em ponto flutuante.

### 4.4 `Order.close` não restringe explicitamente a pedidos `TABLE`
- **Arquivo:** `src/domain/entity/order/index.ts` linhas 679–691
- **Problema:** `assertActive()` permite `OPEN` ou `AWAITING_PAYMENT`; pedidos `COUNTER` nunca estão nesses estados, então hoje é seguro por acidente. A regra de negócio "fechar mesa" não está expressa no domínio.
- **Ação provável:** Adicionar `if (this.props.type !== 'TABLE') throw new InvalidStateTransitionError(...)` para deixar a invariante explícita.

### 4.5 `CloseOrderUseCase` carrega pedido genérico (`findOrderForUpdate`) em vez de `findTableOrderForUpdate`
- **Arquivo:** `src/app/use-cases/orders/close-order.ts` linha 26
- **Problema:** A mensagem de erro para tentativa de fechar `COUNTER` vem do domínio com código genérico; o use case não expressa a regra.
- **Ação provável:** Usar `findTableOrderForUpdate` para consistência com outros use cases de mesa.

### 4.6 `IdGenerators` só cobre pedidos
- **Arquivo:** `src/app/container/types.ts` linhas 13–15
- **Problema:** Apenas `orders` tem gerador de ID explícito. Usuários e itens dependem de `GENERATED BY DEFAULT AS IDENTITY` via repositório. A assimetria é surpreendente.
- **Ação provável:** Decidir se todos os agregados terão geradores explícitos ou documentar por que orders é especial.

### 4.7 `OrderRepository.save` atualiza pai mas substitui filhos cegamente
- **Arquivo:** `src/infrastructure/repositories/order-repository.ts` linhas 252–258
- **Problema:** Deleta todos os itens não presentes no agregado, faz upsert do restante e substitui todos os pagamentos. Está correto, mas é pesado e, combinado com a falta de version check, torna overwrites mais destrutivos.
- **Ação provável:** Avaliar se a performance importa; se sim, usar upsert/diff.

### 4.8 `Order` expõe estado mutável via getters
- **Arquivo:** `src/domain/entity/order/index.ts` linhas 555–561
- **Problema:** `items` retorna as mesmas referências de `OrderItem` armazenadas no `lineMap`, e `payments` retorna a referência interna do array. Callers podem mutar linhas diretamente (`order.items[0].changeQuantity(...)`) ou fazer `push`/`pop` em `payments`, violando invariantes do agregado.
- **Ação provável:** Retornar cópias defensivas ou views readonly.

### 4.9 `OrderItem.changeQuantity` é pública
- **Arquivo:** `src/domain/entity/order/index.ts` linhas 129–132
- **Problema:** Método destinado a ser chamado apenas pelo aggregate root `Order`, mas está exposto publicamente.
- **Ação provável:** Torná-lo acessível apenas internamente ao aggregate (imutabilidade ou contexto do pedido).

---

## 5. Segurança e robustez

### 5.1 Login endpoint aceita senhas sem limite superior de tamanho
- **Arquivo:** `src/app/http/schemas.ts` linhas 5–8
- **Problema:** `loginBodySchema.password` só exige `min(1)`. Não há `max`. Um atacante pode enviar senhas de muitos kilobytes e forçar hash Argon2id em toda tentativa de login, amplificando DoS.
- **Ação provável:** Adicionar `max(128)` (ou o limite da API) ao schema de login.

### 5.2 Criação/atualização de usuário faz hash da senha antes da autorização
- **Arquivos:**
  - `src/app/use-cases/users/create-user.ts` linhas 28–37
  - `src/app/use-cases/users/update-user.ts` linhas 32–39
- **Problema:** `passwordHasher.hash` é executado antes da transação e antes de `requireActor(..., 'users:manage')`. Requisições não autenticadas ou não autorizadas ainda disparam hashing Argon2id.
- **Ação provável:** Mover o hashing para dentro da transação, após `requireActor`.

### 5.3 Email e nome não têm validação completa na borda HTTP
- **Arquivo:** `src/app/http/schemas.ts`
- **Problema:** `email` só é `z.string().min(1)`; a regex fica no domínio. `name` só tem `min(1)`; max (160) só é validado no domínio. `category` (80) também.
- **Ação provável:** Espelhar os limites e a regex de email no schema HTTP para falhar rápido e com mensagens melhores.

### 5.4 Rate limit de login é por processo e confia em `X-Forwarded-For`
- **Arquivo:** `src/app/http/middleware/login-rate-limit.ts`
- **Problema 1:** Requisições sem `X-Forwarded-For`/`X-Real-IP` caem na chave `'unknown'`, permitindo que vários clientes compartilhem o mesmo bucket.
- **Problema 2:** Com `WEB_CONCURRENCY > 1`, cada processo mantém seu próprio `Map`, multiplicando o limite real.
- **Problema 3:** `clientKey()` usa o primeiro valor de `X-Forwarded-For`, que pode ser spoofado se o app não estiver atrás de proxy confiável.
- **Ação provável:** Usar Redis/memória compartilhada para rate limit em produção; usar endereço remoto da conexão ou o valor do proxy confiável mais à direita.

### 5.5 `/auth/logout` é público
- **Arquivo:** `src/app/http/routes/auth.ts` linhas 39–43
- **Problema:** Qualquer um pode enviar um refresh token para `/auth/logout` e revogá-lo. Isso é aceitável para token opaco, mas pode ser explorado se o token vazar.
- **Ação provável:** Considerar exigir access token para logout ou documentar a escolha.

### 5.6 `OrderPayment.create` aceita `receivedCents` positivo; zero não é permitido
- **Arquivo:** `src/app/http/schemas.ts` linha 73
- **Problema:** `receivedCents: z.number().int().positive(...).optional()` impede troco exato quando o cliente paga exatamente o valor (embora nesse caso `receivedCents` seja opcional).
- **Ação provável:** Tornar `receivedCents` `min(0)` ou manter opcional e rejeitar zero no domínio se necessário.

### 5.7 Erros genéricos da infraestrutura viram 500
- **Arquivos:**
  - `src/infrastructure/repositories/order-repository.ts` linhas 248–250 (`new Error('Order not found')`)
  - `src/infrastructure/repositories/user-repository.ts` linhas 102–103 (`Failed to create user`), 208–210 (`Failed to resolve user roles`)
  - `src/infrastructure/repositories/item-repository.ts` linhas 122–126 (`Failed to create item`)
- **Problema:** `AppError`/`DomainError` são mapeados para status HTTP corretos, mas `Error` genérico cai em 500.
- **Ação provável:** Lançar `NotFoundError`, `ConflictError` ou erros de domínio apropriados.

### 5.8 Violações de constraints SQL não são mapeadas para HTTP
- **Arquivo:** `src/app/http/error-handler.ts`
- **Problema:** Apenas `AppError` e `DomainError` são mapeados. Violações de unique/foreign-key/check do PostgreSQL retornam 500 e expõem detalhes internos no log.
- **Ação provável:** Capturar erros do driver Bun SQL e convertê-los para `ConflictError`/`ValidationError`.

### 5.9 Hash de refresh token é SHA-256 simples
- **Arquivo:** `src/infrastructure/authentication/refresh-token-codec.ts` linhas 11–13
- **Problema:** Tokens longos, mas SHA-256 sem salt/pepper/iteração torna brute-force offline mais rápido se o banco vazar.
- **Ação provável:** Usar HMAC-SHA256 com um server-side pepper, ou Argon2id se a latência for aceitável.

### 5.10 `DatabaseConnections` expõe `read`/`write` brutos
- **Arquivo:** `src/infrastructure/database/connections.ts` linhas 5–9, 38–39
- **Problema:** Consumidores podem acessar `read`/`write` diretamente, ignorando o `AsyncLocalStorage` de transação.
- **Ação provável:** Tornar `read`/`write` privados ou documentar que apenas `readSql()`/`writeSql()` devem ser usados.

### 5.11 `SqlClient` faz cast sem validação runtime
- **Arquivo:** `src/infrastructure/database/sql-client.ts` linhas 33–38
- **Problema:** `query` e `unsafe` fazem cast do resultado Bun SQL para `Promise<T>`. Formatos inesperados não são detectados em runtime.
- **Ação provável:** Considerar validação de schema (ex.: zod) em repositories críticos.

---

## 6. Concorrência e transações

### 6.1 `OrderRepository.save` ignora a coluna `version`
- **Arquivo:** `src/infrastructure/repositories/order-repository.ts` linhas 218–259
- **Problema:** O domínio incrementa `version` a cada mutação (`Order.touch`), mas `save()` atualiza apenas por `id` e nunca verifica `version`. A versão é, portanto, peso morto.
- **Impacto:** Duas modificações sequenciais são serializadas por `FOR UPDATE`, mas a segunda sobrescreve a primeira silenciosamente. Nunca ocorre `409 CONFLICT` por dados desatualizados.
- **Ação provável:** Adicionar `AND version = $oldVersion` no UPDATE e retornar `409 VERSION_CONFLICT` quando nenhuma linha for afetada.

### 6.2 Abertura concorrente da mesma mesa retorna 500 em vez de 409
- **Arquivo:** `src/app/use-cases/orders/open-table-order.ts` linhas 25–38
- **Problema:** `findActiveTableByCode` é leitura simples sem lock. O índice único parcial (`orders_one_active_per_table_idx`) evita corrupção, mas o perdedor de uma corrida recebe `unique-violation` do PostgreSQL, que vira `500 INTERNAL_ERROR` em vez do esperado `409 TABLE_OCCUPIED`.
- **Ação provável:** Capturar violação única e converter para `ConflictError` com `code: 'TABLE_OCCUPIED'`.

### 6.3 Unicidade de email em criação/atualização de usuário tem race condition
- **Arquivos:**
  - `src/app/use-cases/users/create-user.ts` linhas 38–43
  - `src/app/use-cases/users/update-user.ts` linhas 69–76
- **Problema:** Ambos verificam `findByEmail` dentro da transação, mas não travam a chave. Requisições concorrentes com o mesmo email violam `users_email_unique` e retornam `500`.
- **Ação provável:** Usar `SELECT ... FOR UPDATE` no email ou capturar a violação única e converter para `ConflictError`.

### 6.4 Atualizações de item/usuário são last-write-wins
- **Arquivos:**
  - `src/infrastructure/repositories/item-repository.ts` linhas 140–155
  - `src/infrastructure/repositories/user-repository.ts` linhas 119–133
- **Problema:** Nenhuma das entidades tem optimistic locking. Edições concorrentes de item ou usuário podem se sobrescrever.
- **Ação provável:** Adicionar coluna `version` a `items` e `users` ou usar outro mecanismo de detecção de conflito.

### 6.5 `readOnly` rota chamadas `writeSql()` para a conexão de leitura
- **Arquivo:** `src/infrastructure/database/connections.ts` linhas 50–55
- **Problema:** `readOnly` armazena o cliente de leitura no `AsyncLocalStorage`. Qualquer repository que chame `writeSql()` dentro de `readOnly` recebe a conexão de leitura, podendo causar escritas acidentais em réplica read-only.
- **Ação provável:** Lançar erro se `writeSql()` for chamado dentro de `readOnly`, ou não substituir o contexto de escrita.

### 6.6 `readOnly` não inicia transação real de banco
- **Arquivo:** `src/infrastructure/database/connections.ts` linhas 50–55
- **Problema:** Trabalho de leitura de multi-queries não tem snapshot ou garantia de conexão única. Cada query pode ser servida por uma conexão diferente do pool.
- **Ação provável:** Iniciar transação readonly (`BEGIN READ ONLY`) quando múltiplas queries precisarem de consistência.

### 6.7 `CountCache` não previne thundering herd
- **Arquivo:** `src/infrastructure/database/count-cache.ts` linhas 18–37
- **Problema:** Múltiplas requisições concorrentes para uma chave ausente invocam `load()` em paralelo; a promise só é armazenada depois que `load()` é chamado.
- **Ação provável:** Armazenar uma promise de placeholder antes de invocar `load()`.

### 6.8 `CountCache` limpa todo o mapa ao atingir limite
- **Arquivo:** `src/infrastructure/database/count-cache.ts` linhas 29–31
- **Problema:** Ao atingir `maxEntries`, todas as entradas são removidas. Uma evicção LRU/FIFO preservaria caches não relacionados.
- **Ação provável:** Implementar evicção parcial.

### 6.9 Cache de `COUNT(*)` é por processo
- **Arquivo:** `src/infrastructure/database/count-cache.ts`
- **Problema:** Com `WEB_CONCURRENCY > 1`, cada processo mantém seu próprio cache. O total pode variar entre requests.
- **Ação:** Já documentado no README; avaliar se o trade-off continua válido e, se sim, documentar no contrato da API.

---

## 7. Banco de dados / migrations

### 7.1 Migration `002` DOWN perde informação quando surcharge = discount
- **Arquivo:** `migrations/002_order_surcharge_discount.down.sql` linhas 15–28
- **Problema:** Quando `surcharge_cents = discount_cents`, ambos os ajustes antigos ficam `NULL`; a informação de que havia ambos é perdida. A reversibilidade é limitada.
- **Ação provável:** Documentar a limitação no comentário da migration.

### 7.2 `001` DOWN não trata explicitamente pedidos `AWAITING_PAYMENT`
- **Arquivo:** `migrations/001_initial_schema.down.sql` linhas 6–21
- **Problema:** Apesar de `DROP TABLE` remover a dependência do enum, o DOWN não tem tratamento explícito para bancos populados. O teste de integração mascara isso truncando `orders` primeiro.
- **Ação provável:** Documentar que DOWN requer banco vazio ou adicionar manipulação explícita.

### 7.3 `orders_service_fee_valid` impede estados intermediários
- **Arquivo:** `migrations/001_initial_schema.up.sql` linhas 134–138
- **Problema:** A constraint exige que, se `apply_service_fee = false`, então `service_fee_basis_points = 0`. O domínio (`Order.setServiceFee`) já zera ao desligar, mas a constraint impede estados intermediários.
- **Ação:** Verificar se é intencional; adicionar teste de integração se for.

### 7.4 Índice parcial `items_sellable_category_idx` não cobre itens desativados
- **Arquivo:** `migrations/001_initial_schema.up.sql` linhas 231–233
- **Problema:** Administradores veem itens desativados (`active = false`) na listagem, mas o índice só cobre `active = true`.
- **Ação provável:** Adicionar índice separado para a consulta administrativa ou remover a parcialidade.

### 7.5 `audit_logs` armazena `metadata` como `JSONB` sem schema
- **Arquivo:** `migrations/001_initial_schema.up.sql` linhas 202–213
- **Risco:** PII ou tokens podem acabar no JSONB acidentalmente.
- **Ação provável:** Adicionar teste que inspeciona os metadados auditados e garante que nunca contenham senhas, hashes, tokens ou JWTs.

---

## 8. Docker / operações

### 8.1 Dockerfile copia `src/` desnecessariamente para runtime
- **Arquivo:** `infra/api/Dockerfile` linhas 7 e 18
- **Problema:** A etapa de build já gera `dist/`; copiar `src/` novamente na imagem final aumenta o tamanho sem necessidade.
- **Ação provável:** Remover `COPY src ./src` do estágio `runtime`.

### 8.2 `docker-compose.yml` não define `.env` padrão
- **Arquivo:** `infra/docker-compose.yml`
- **Problema:** Usa `--env-file infra/.env`, mas `.env.example` raiz foi removido e `infra/.env` pode não existir.
- **Ação provável:** Restaurar `infra/.env.example` com os valores mínimos.

### 8.3 Várias variáveis do Compose não têm defaults
- **Arquivo:** `infra/docker-compose.yml` linhas 38–55
- **Problema:** `NODE_ENV`, `HOST`, `PORT`, `JWT_SECRET`, etc. não têm fallback `${VAR:-default}`. Se `infra/.env` omitir uma, Compose injeta string vazia e a validação de config falha.
- **Ação provável:** Adicionar defaults sensíveis ou marcar como required em comentários.

### 8.4 API service não tem healthcheck no Docker Compose
- **Arquivo:** `infra/docker-compose.yml` linhas 33–62
- **Problema:** `nginx` depende de `api` com `condition: service_started`, que só espera o container iniciar, não a API estar pronta.
- **Ação provável:** Adicionar `healthcheck` em `api` apontando para `/health` ou `/health/ready`.

### 8.5 PostgreSQL 18 usado sem justificativa
- **Arquivos:**
  - `infra/docker-compose.yml` linhas 5–6
  - `infra/database/Dockerfile` linha 1
  - `.github/actions/database/action.yml` linha 22
- **Problema:** Usa `postgres:18-alpine`. Verificar disponibilidade/estabilidade; a maioria dos ecossistemas trata 17 como major maduro atual.
- **Ação provável:** Fixar major conhecido com digest explícito.

### 8.6 `capacity-run.sh` depende de nomes de processo frágeis
- **Arquivo:** `scripts/capacity-run.sh` linhas 24–31
- **Problema:** Usa `top` e nomes hardcoded (`bun`, `postgres`, `k6`). Nomes podem diferir por OS/Docker, produzindo métricas de CPU ausentes.
- **Ação provável:** Tornar a coleta de CPU opcional ou usar identificadores mais robustos.

### 8.7 `cleanup-refresh-tokens.ts` não trata erros de configuração
- **Arquivo:** `scripts/cleanup-refresh-tokens.ts`
- **Problema:** Se `DATABASE_WRITE_URL` estiver ausente, `createContainer()` lança `ConfigurationError` sem mensagem amigável.
- **Ação provável:** Adicionar `try/catch` com `process.stderr.write` e exit code.

### 8.8 Gitleaks está em versão antiga
- **Arquivo:** `.github/workflows/ci.yml` linha 287
- **Problema:** Usa `zricethezav/gitleaks:v8.30.1` (2023). Regras mais novas e correções não estão disponíveis.
- **Ação provável:** Avaliar upgrade para versão atual e revalidar `.gitleaks.toml`.

---

## 9. Domínio — gaps e fragilidades

### 9.1 `SalesSummary` não inclui `averageTicketCents`
- **Arquivo:** `src/domain/repository/report-repository.ts` linhas 15–24
- **Problema:** README exige `averageTicketCents` no resumo. O tipo `SalesSummary` não o inclui; o cálculo é feito no use case (`get-sales-summary.ts:67-68`) com divisão de ponto flutuante.
- **Ação provável:** Adicionar `averageTicketCents` ao contrato de domínio e computá-lo no repository.

### 9.2 Propriedade `active` de `Item` conflita com semântica de `isActive`
- **Arquivo:** `src/domain/entity/item/index.ts` linhas 9–20, 138–149
- **Problema:** O prop interno e os inputs se chamam `active`, mas `isActive` significa "não removido" e `isEnabled` significa "ativo/vendável". A mesma palavra tem dois significados.
- **Ação provável:** Renomear prop/input para `enabled`; manter getters `isActive`/`isEnabled`. O repository faz o mapeamento para a coluna `active` do banco.

### 9.3 `Order.restore` não valida invariantes de estado
- **Arquivo:** `src/domain/entity/order/index.ts` linhas 414–471
- **Problema:** Não verifica que `COUNTER` deve ser `CLOSED`, que `CLOSED`/`CANCELED` precisam de actor/timestamp, ou que `OPEN`/`AWAITING_PAYMENT` precisam de `tableCode`.
- **Ação provável:** Adicionar validações de consistência no `restore`.

### 9.4 `ValueObject.equals` não funciona para payloads objeto
- **Arquivo:** `src/domain/value-objects/value-object.ts` linhas 18–28
- **Problema:** `Object.is(this.props, other.props)` compara identidade de objeto, não igualdade profunda. O comentário promete "value-based equality".
- **Ação provável:** Implementar deep equality na base ou documentar que VOs compostos devem fazer override.

### 9.5 `permissionsForRoles` confia no input em runtime
- **Arquivo:** `src/domain/entity/role/index.ts` linhas 51–61
- **Problema:** Se um valor não-`RoleCode` for passado, `ROLE_PERMISSIONS[role]` é `undefined` e iterar sobre ele lança erro confuso.
- **Ação provável:** Validar cada role com `isRoleCode` e lançar `InvalidValueError`.

### 9.6 `Order.assertAmountsValid` tem forma enganosa
- **Arquivo:** `src/domain/entity/order/index.ts` linhas 734–745
- **Problema:** Chama `calculatePricing` apenas pelo efeito colateral de lançar exceção; ignora o resultado. Argumentos default tornam fácil esquecer qual estado está sendo validado.
- **Ação provável:** Renomear para `validatePricing`/`assertPricingValid` e aceitar um `PricingInput` explícito.

### 9.7 `requireNonNegativeMoney` aloca novo `Money` desnecessariamente
- **Arquivo:** `src/domain/entity/order/pricing.ts` linhas 31–37
- **Problema:** Retorna `Money.fromCents(value.cents)` em vez de `value` (já imutável).
- **Ação provável:** Retornar `value`.

### 9.8 `OrderPayment` tem ID nullable sem caminho de atribuição
- **Arquivo:** `src/domain/entity/order/index.ts` linhas 135–248
- **Problema:** `create` define `id: null`. Não há método de domínio para atribuir ID após persistência.
- **Ação provável:** Documentar a escolha ou fornecer método `assignId`.

### 9.9 Entidades `Settings`, `AuditLog`, `RefreshToken` não têm factory de criação
- **Arquivos:** `src/domain/entity/settings/index.ts`, `src/domain/entity/audit-log/index.ts`, `src/domain/entity/refresh-token/index.ts`
- **Problema:** Criação é feita via DTOs plain (`NewAuditLog`, `NewRefreshToken`) ou implicitamente pelo repository.
- **Ação provável:** Adicionar factories `create`/`default` que centralizem validação de estado inicial.

### 9.10 Filtro `status` + `statuses` em `OrderFilters` é confuso
- **Arquivo:** `src/domain/repository/order-repository.ts` linhas 4–13
- **Problema:** Contrato tem ambos os campos, que devem ser combinados. API pública só documenta `status`.
- **Ação provável:** Manter apenas `statuses: readonly OrderStatus[]`.

---

## 10. Testes — gaps e fragilidades

### 10.1 `test` script é enganoso
- **Arquivo:** `package.json` linha 19
- **Problema:** `"test": "bun test tests/unit"` roda apenas unitários. O script convencional deveria rodar a suite completa; all-tests está em `"test:all": "bun test"`.
- **Ação provável:** Trocar nomes ou adicionar documentação clara.

### 10.2 Testes unitários usam `as unknown as Repositories`
- **Exemplos:** `tests/unit/app/order-workflow-use-cases.test.ts`, `tests/unit/app/authorization.test.ts`, `tests/unit/support/fakes.ts`
- **Problema:** Cast inseguro esconde mudanças na interface dos repositories.
- **Ação provável:** Criar builders tipados ou usar partial types com verificação.

### 10.3 `tests/support/container.ts` fornece mocks não realistas
- **Arquivo:** `tests/support/container.ts` linhas 60–64
- **Problema:** `tokenService.verify` sempre lança erro; testes de middleware de autenticação podem passar por razões erradas.
- **Ação provável:** Implementar um token service fake que aceita/rejeita tokens de teste.

### 10.4 Testes duplicados e nomes ambíguos em `item.test.ts`
- **Arquivo:** `tests/unit/domain/item.test.ts`
- **Problema:** Blocos de teste são duplicados (linhas 60–95 vs 97–132) e nomes iguais dificultam identificar falhas.
- **Ação provável:** Remover duplicatas e renomear testes para serem únicos.

### 10.5 Asserções "sempre verdadeiras"
- **Arquivos:**
  - `tests/unit/app/user-safeguards.test.ts` linhas 93, 142, 191, 247
  - `tests/unit/app/order-workflow-use-cases.test.ts` linha 263
- **Problema:** `expect(unitOfWork).toBeDefined()` / `resolves.toBeDefined()` não verificam a regra que o teste descreve.
- **Ação provável:** Substituir por asserções sobre o estado real (ex.: `state.counts`, `saved.length`, valores do pedido).

### 10.6 Testes de `supervisor` dependem de timers reais
- **Arquivo:** `tests/unit/infrastructure/supervisor.test.ts` linhas 48, 87
- **Problema:** Usam `setTimeout(resolve, 10)` / `setTimeout(resolve, 40)` para esperar restarts assíncronos. Podem falhar em runners lentos.
- **Ação provável:** Injetar clock/controlador de promises ou aumentar margens.

### 10.7 Teste de recuperação do `count-cache` acoplado a microtasks
- **Arquivo:** `tests/unit/infrastructure/count-cache.test.ts` linha 60
- **Problema:** Espera `setTimeout(resolve, 0)` após load rejeitado e assume que o estado interno foi limpo. Pode falhar e é acoplado à implementação.
- **Ação provável:** Expor de forma controlada o estado de erro ou testar via comportamento observável.

### 10.8 `http-security.test.ts` muta `Date.now` global
- **Arquivo:** `tests/unit/app/http-security.test.ts` linhas 108, 126
- **Problema:** Reatribui `Date.now = () => clock` (onde `clock` é número, não função que retorna número), o que é type-unsafe e pode vazar entre arquivos se `finally` for pulado.
- **Ação provável:** Usar clock injetado em vez de mutar global.

### 10.9 Teste de banco concorrente tem timeout apertado
- **Arquivo:** `tests/integration/database.test.ts` linhas 73–84
- **Problema:** 40 transações concorrentes com sleeps de 50 ms; timeout de 20 s pode ser apertado em runners de CI sobrecarregados.
- **Ação provável:** Aumentar timeout ou reduzir número de transações.

### 10.10 Fingerprint de migration é sensível à versão do PostgreSQL
- **Arquivo:** `tests/integration/migrations.test.ts` linhas 53–81
- **Problema:** Compara strings de `column_default`, `pg_get_constraintdef` e `indexdef`. Diferenças de formatação entre versões do Postgres podem falhar mesmo quando o schema é semanticamente idêntico.
- **Ação provável:** Comparar estrutura normalizada (ex.: parsear e comparar colunas/tabelas) em vez de strings brutas.

### 10.11 Suites de integração e e2e compartilham um único banco
- **Arquivos:**
  - `tests/integration/support/database.ts` linha 7
  - `tests/e2e/support/harness.ts` linhas 25–26
- **Problema:** Bun roda arquivos de teste em paralelo. `beforeEach` trunca tabelas, mas sequences, a linha singleton `settings` e códigos de mesa (ex.: `T-1`) criam risco de colisão entre arquivos.
- **Ação provável:** Usar bancos isolados por arquivo de teste ou templates.

### 10.12 Lista de índices na migration test é frágil
- **Arquivo:** `tests/integration/migrations.test.ts` linhas 260–288
- **Problema:** Hard-coded "kept" e "removed" index names. Adições/remoções legítimas de índices em migrations futuras falharão mesmo quando o comportamento estiver correto.
- **Ação provável:** Testar a existência de índices essenciais dinamicamente a partir das definições de migration.

### 10.13 Faltam testes para caminhos críticos
- **Lista:**
  - Counter-order service-fee defaults e snapshot behavior (apenas indiretamente testado).
  - Reabertura de pedido já `CLOSED`.
  - Abertura concorrente da mesma mesa.
  - `expectedVersion` / `409 VERSION_CONFLICT` (prometido em ADR-06, mas não implementado nem testado).
  - `Money.format` sem ponto flutuante.
  - Rate limit por IP.
  - Reutilização de refresh token revogando todos os tokens do usuário.
  - Audit: múltiplas operações auditadas em uma requisição compartilham o mesmo `request_id`.
  - Scripts operacionais (`create-admin`, `seed-root`, `cleanup-refresh-tokens`).
  - `UserRoleKey.equals`, `ValueObject.equals` com props objeto.
  - `Order.restore` com estados inválidos.
  - Encapsulamento de `Order` (mutação externa de `items`/`payments`).
- **Ação provável:** Adicionar testes conforme prioridade.

### 10.14 CI `e2e` job tem guarda condicional desnecessária
- **Arquivo:** `.github/workflows/ci.yml` linhas 108–121
- **Problema:** Checa se existem testes em `tests/e2e/*.test.ts`; agora existem, então a guarda é obsoleta.
- **Ação provável:** Simplificar o job para sempre rodar os e2e.

---

## 11. OpenAPI / documentação da API

### 11.1 Códigos de erro específicos não aparecem no documento
- **Arquivo:** `src/app/http/openapi/document.ts` linhas 98–106, 379–393
- **Problema:** `409` é documentado genericamente. A API retorna códigos específicos (`TABLE_OCCUPIED`, `LAST_ADMIN`, `CANNOT_DEACTIVATE_SELF`, etc.), mas esses não são expostos.
- **Ação provável:** Incluir os códigos específicos nas descrições de erro ou no schema.

### 11.2 `x-roles` é extensão não padronizada
- **Arquivo:** `src/app/http/openapi/document.ts` linha 606
- **Problema:** Roles são comunicadas via extensão custom `x-roles` em vez de padrões nativos do OpenAPI (`security`/`description`). Consumidores podem não reconhecê-la.
- **Ação provável:** Considerar descrever roles no texto da descrição ou usar security scopes.

### 11.3 `API_VERSION` pode divergir de `package.json`
- **Arquivo:** `src/app/http/openapi/document.ts` linha 32
- **Problema:** Ambos estão `0.1.0`, mas nada garante alinhamento futuro.
- **Ação provável:** Derivar `API_VERSION` de `package.json` em tempo de build ou adicionar teste.

---

## 12. Código duplicado / pode ser simplificado

### 12.1 `OrderItemKey.toString()` é usado como chave de `Map` em vez do próprio Value Object
- **Arquivo:** `src/domain/entity/order/index.ts` linhas 326, 419–426, 580–582, 610, 710
- **Problema:** Cria string para indexação em vez de usar o Value Object como chave (JavaScript `Map` suporta objetos como chave).
- **Ação provável:** Usar `OrderItemKey` diretamente como chave do `Map` (já existe override de `equals`).

### 12.2 `requireNonNegativeMoney` é chamada em `calculatePricing` e depois novamente no input
- **Arquivo:** `src/domain/entity/order/pricing.ts`
- **Problema:** `calculatePricing` chama `requireNonNegativeMoney` para `surcharge` e `discount`, mas `Order.setAmounts` também valida antes de chamar.
- **Ação provável:** Manter a validação no domínio (`setAmounts`) e tornar `calculatePricing` uma função pura de cálculo.

### 12.3 `OpenTableOrderUseCase` e `CreateCounterOrderUseCase` repetem padrão de `settings.get()`
- **Ação provável:** Extrair helper `currentServiceFeeBasisPoints(repositories)` se a regra for a mesma.

### 12.4 `OrderRepository.save` sempre deleta e reinsere pagamentos
- **Arquivo:** `src/infrastructure/repositories/order-repository.ts` linhas 252–258
- **Problema:** `replace` apaga todos os pagamentos e reinsere, mesmo quando nenhum mudou.
- **Ação:** Deixar assim por clareza ou usar upsert/diff.

### 12.5 Padrão `string_to_array(${ids.join(',')}, ',')::bigint[]` duplicado
- **Arquivos:** `order-item-repository.ts`, `order-payment-repository.ts`, `user-role-repository.ts`, `role-repository.ts`
- **Problema:** Mesmo padrão de conversão de lista de IDs para array SQL copiado em vários repositories.
- **Ação provável:** Criar helper `toBigintArray(ids)` no `SqlClient` ou em utilitário de repository.

### 12.6 `OrderRepository.save` descarta IDs de pagamentos existentes
- **Arquivo:** `src/infrastructure/repositories/order-payment-repository.ts` linhas 77–80
- **Problema:** `replace` apaga e reinsere pagamentos, desperdiçando valores de sequence e quebrando estabilidade de identidade.
- **Ação provável:** Fazer upsert ou diff, preservando IDs.

### 12.7 `UserRoleRepository.replaceForUser` faz N inserts
- **Arquivo:** `src/infrastructure/repositories/user-role-repository.ts` linhas 60–70
- **Problema:** Loop inserindo um papel por query.
- **Ação provável:** Usar `INSERT ... VALUES (...), (...)` em uma única query.

### 12.8 `UserRepository.update` sempre reescreve roles
- **Arquivo:** `src/infrastructure/repositories/user-repository.ts` linhas 119–133
- **Problema:** Mesmo quando o conjunto de papéis não mudou, `replaceRoles` deleta e reinsere.
- **Ação provável:** Comparar antes de substituir.

### 12.9 `ReportRepository` faz quatro round-trips separados
- **Arquivo:** `src/infrastructure/repositories/report-repository.ts` linhas 12–40
- **Problema:** `closed`, `canceled`, `live` e `methods` poderiam ser uma única query CTE.
- **Ação provável:** Avaliar se a redução de round-trips justifica a complexidade.

### 12.10 `settings-repository.ts` hardcoded o id singleton
- **Arquivo:** `src/infrastructure/repositories/settings-repository.ts` linhas 19–27, 42–52
- **Problema:** `WHERE id = 1` repetido.
- **Ação provável:** Centralizar a chave singleton em uma constante.

---

## 13. Débitos técnicos menores

### 13.1 `dist/` e `node_modules/` estão presentes no working tree
- Não devem ser commitados (já estão no `.gitignore`), mas ocupam espaço e poluem análises. Considerar limpar.

### 13.2 `.openidea/` não está no `.gitignore`
- **Ação provável:** Adicionar `.openidea/` ao `.gitignore`.

### 13.3 `OrderPaymentRow` declara `order_id?: string` como opcional
- **Arquivo:** `src/infrastructure/repositories/order-payment-repository.ts` linha 9
- **Problema:** `order_id` é NOT NULL no banco; o opcional só existe para reutilizar o tipo em `findByOrderIds`.
- **Ação provável:** Usar tipos separados para leitura com e sem `order_id`.

### 13.4 `UserRepository.create` retorna usuário reconstruído com `User.create` em vez do registro recém-lido
- **Arquivo:** `src/infrastructure/repositories/user-repository.ts` linhas 109–117
- **Problema:** Pode perder defaults do banco (ex.: timestamps truncados) e não reflete exatamente o que foi persistido.
- **Ação provável:** Retornar `User.restore` a partir do row inserido (fazer `RETURNING *`).

### 13.5 `OrderRepository.create` insere linhas/pagamentos em três statements separados
- **Arquivo:** `src/infrastructure/repositories/order-repository.ts` linhas 186–188
- **Problema:** Está dentro de uma transação, mas três round-trips extras.
- **Ação:** Deixar assim por clareza ou usar batch insert.

### 13.6 `create-admin.ts` exige senha de 12 caracteres, mas API aceita 8
- **Arquivo:** `scripts/create-admin.ts` linha 8
- **Impacto:** Inconsistência de política entre bootstrap e API.
- **Ação provável:** Usar o mesmo `passwordSchema` da API ou justificar a diferença.

### 13.7 `seed-root-entrypoint.ts` não sanitiza/valida e-mail nem senha
- **Arquivo:** `scripts/seed-root-entrypoint.ts`
- **Problema:** Aceita qualquer `ROOT_PASSWORD` com ≥12 chars e qualquer `ROOT_EMAIL` formatado.
- **Ação provável:** Aplicar as mesmas validações do domínio.

### 13.8 `JsonLogger` descarta propriedades customizadas de `Error`
- **Arquivo:** `src/infrastructure/logging/json-logger.ts` linhas 22–28
- **Problema:** Ao serializar `Error`, só mantém `name`, `message`, `stack`. Propriedades como `code`, `status`, `errors` são perdidas.
- **Ação provável:** Incluir propriedades próprias do erro (com redação).

### 13.9 `JsonLogger` lança em `BigInt`
- **Arquivo:** `src/infrastructure/logging/json-logger.ts` linha 94
- **Problema:** `JSON.stringify` lança para `BigInt`.
- **Ação provável:** Tratar `BigInt` no redator (ex.: converter para string).

### 13.10 `JsonLogger` redação depende apenas de nomes de chave
- **Arquivo:** `src/infrastructure/logging/json-logger.ts` linha 11
- **Problema:** Valores que parecem JWT/bearer token/hash não são redigidos se a chave não corresponder. Variantes como `apiKey`, `privateKey`, `auth` não são cobertas.
- **Ação provável:** Expandir lista de chave ou adicionar heurística de valor.

### 13.11 Supervisor reinicia workers incondicionalmente para sempre
- **Arquivo:** `src/infrastructure/process/supervisor.ts` linhas 23–48
- **Problema:** Sem contagem máxima de reinício, backoff, e até exit code `0` dispara reinício.
- **Ação provável:** Adicionar max restarts e backoff exponencial.

### 13.12 `supervise` vaza workers se `start()` lançar sincronamente
- **Arquivo:** `src/infrastructure/process/supervisor.ts` linhas 28–48
- **Problema:** Loop de launch não captura erros síncronos de `start()`.
- **Ação provável:** Adicionar try/catch e cleanup.

### 13.13 `JwtTokenService` arredonda issued/expiration para segundos inteiros
- **Arquivo:** `src/infrastructure/authentication/jwt-token-service.ts` linhas 27–29
- **Problema:** `Math.floor` pode fazer tokens durarem um pouco menos ou mais que o configurado.
- **Ação provável:** Documentar ou usar precisão de milissegundos quando suportado.

### 13.14 `BunPasswordHasher` tem parâmetros Argon2 hardcoded
- **Arquivo:** `src/infrastructure/authentication/bun-password-hasher.ts` linhas 3–7
- **Problema:** Não podem ser ajustados por ambiente.
- **Ação provável:** Tornar configuráveis via env/constantes documentadas.

### 13.15 `UserRepository.list` não usa count cache
- **Arquivo:** `src/infrastructure/repositories/user-repository.ts` linhas 135–160
- **Problema:** Itens e pedidos usam `CountCache`, mas listagem de usuários faz `COUNT(*)` toda vez.
- **Ação provável:** Decidir se a consistência exige cache também para usuários.

---

## 14. Recomendações de prioridade

| Prioridade | Item | Motivo |
|---|---|---|
| **P0** | Corrigir `typecheck` e `lint` | CI e pre-commit quebrados |
| **P0** | Restaurar `.env.example` | Onboarding e Docker Compose dependem |
| **P0** | Remover `pnpm-lock.yaml` | Lockfile duplicado |
| **P1** | Alinhar README/AGENTS.md com ADR-02/ADR-01 | Documentação é contrato |
| **P1** | Traduzir comentários de `seed-root-entrypoint.ts` | Conformidade `AGENTS.md` |
| **P1** | Resolver `Money.format` com ponto flutuante | Regra de domínio explícita |
| **P1** | Implementar optimistic locking em `OrderRepository.save` | ADR-06 promete `version` |
| **P1** | Corrigir race de abertura de mesa (500 → 409) | Experiência da API |
| **P1** | Mover hash de senha para após `requireActor` | Segurança |
| **P2** | Melhorar scripts de bootstrap para usarem domínio | Consistência de dados |
| **P2** | Remover validações duplicadas em use cases | Simplificação |
| **P2** | Mapear erros de constraint SQL para HTTP adequado | Robustez |
| **P2** | Adicionar testes de concorrência e versionamento | Requisitos `AGENTS.md` |
| **P3** | Refinar Dockerfile e Docker Compose | Menor imagem e melhor startup |
| **P3** | Extrair `LogLevel` e `requireBasisPoints` | Menor acoplamento |

---

## 15. Como reproduzir as falhas atuais

```bash
# 1. Typecheck quebrado
bun run typecheck

# 2. Lint quebrado / schema desatualizado
bun run lint

# 3. .env.example ausente
git status --short

# 4. Lockfile duplicado
ls -la pnpm-lock.yaml bun.lock

# 5. Unit tests ainda passam
bun test tests/unit
```

---

## Notas gerais

- A arquitetura de três camadas (`app`, `domain`, `infrastructure`) é respeitada na maioria dos lugares.
- A cobertura de testes unitários é alta (294 testes passando), mas faltam testes de integração para concorrência, versionamento e alguns cenários de segurança.
- O domínio de pedidos (`Order`, `OrderItem`, `OrderPayment`) está bem modelado e as regras de preço/taxa estão centralizadas.
- Os principais riscos atuais são **build quebrado**, **documentação desatualizada**, **falta de locking otimista**, **algumas regras de negócio implícitas no código** e **problemas de segurança/DoS em autenticação**.
