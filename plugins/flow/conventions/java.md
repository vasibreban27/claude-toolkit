# Java conventions (Spring Boot)

Shared by the `plan` skill (it reads `## Layout` to choose `Owns` paths) and the `java-developer` worker (it reads the whole file).
These are defaults for new code. A project's `CLAUDE.md` and its existing structure win over this file.

## Layout
Layer-first packages under the base package (`src/main/java/<base/package>/`), tests mirrored under `src/test/java/<base/package>/`:

| Package | Holds |
|---|---|
| `controller/` | `*Controller` classes and their `*Api` interfaces (mapping, `@Valid`, OpenAPI annotations) |
| `service/` | service interfaces (`*Service`) |
| `service/impl/` | implementations (`*ServiceImpl`) |
| `repository/` | Spring Data repositories |
| `domain/` | JPA entities, enums, `AuditableEntity` |
| `dto/` | request/response records, page record |
| `mapper/` | MapStruct mappers |
| `exception/` | `BusinessException`, `ResourceNotFoundException`, `ErrorResponse`, the `@RestControllerAdvice`, message constants |
| `config/` | `@Configuration` and `@ConfigurationProperties` records |
| `security/` | security config, JWT, ownership validators |
| `specification/` | JPA Specifications |
| `job/` | scheduled jobs (thin) |

Tests: `unit/{service,mapper,security,handler}` and `integration/{controller,repository,specification}`. Migrations: `src/main/resources/db/migration/`.
Flow is controller → service interface (+ `*ServiceImpl`) → repository. Controllers only map HTTP and delegate; no logic, no entities in or out. Services take no HTTP types.
Do not invent other top-level packages (`api/`, `web/`, `error/`, `core/`, feature folders) unless the project already uses them.

## Rules
**Stack**: Java 21, Spring Boot with the Maven wrapper, Spring Data JPA + PostgreSQL, Flyway, Lombok, MapStruct, Bean Validation. Check the Boot version: Boot 4 uses Jackson 3 (`tools.jackson.*` imports).

**API**: base path `/api/<kebab-case-plural>`, UUID path ids, no URL versioning. Put the mapping, `@Valid` and OpenAPI annotations (`@Operation`, `@ApiResponses` for every status) on an `*Api` interface that the controller implements. If the project is contract-first (OpenAPI generator), edit the contract and implement the generated interface instead. Status codes: 201 on create, 204 on delete, 200 otherwise.

**DTOs and mapping**: Java records, named `Create*Request`, `Update*Request`, `*Response`. Jakarta validation on request records; cross-field and business rules in the service or a validator class. MapStruct with `componentModel = "spring"` and `unmappedTargetPolicy = ERROR`; ignore id and audit fields on `toEntity`, map relations as ids and resolve them in the service; separate methods for create, full update (PUT) and partial update (PATCH).

**Lists**: `page` (zero-based), `size` (capped, e.g. 200) and `sort` (`field,asc`) params; whitelist the sort fields; return a page record (`content`, `page`, `size`, `totalElements`, `totalPages`). Dynamic filters use JPA Specifications.

**Errors**: `BusinessException` (message, code, `HttpStatus`) and `ResourceNotFoundException`, with message texts as constants (no duplicates). One `@RestControllerAdvice` returns one `ErrorResponse` (`timestamp`, `status`, `error`, `message`, `path`, `fieldErrors`) and maps: business → its status, validation/malformed body/type mismatch → 400, auth → 401, access denied → 403, not found → 404, data integrity or optimistic lock → 409, anything else → 500 with a generic message and the stack trace logged. Log 4xx at `warn` with `path={}`. Never throw raw `IllegalStateException`/`IllegalArgumentException` from business code (they become 500s).

**Persistence**: entities use `@Getter @Setter @NoArgsConstructor` (never `@Data`), UUID ids (`GenerationType.UUID`), `@Enumerated(STRING)`, `@ManyToOne(fetch = LAZY)` with explicit `@JoinColumn`, snake_case tables (plural) and columns, audit fields via an `AuditableEntity` base (created/updated at/by), `@Version` where updates are contended. Keep bidirectional collections in sync with add/remove helpers. `ddl-auto: validate`, `open-in-view: false`; Flyway owns the schema. Repositories extend `JpaRepository<Entity, UUID>`; prefer derived queries, then JPQL text blocks with `@Param` and `JOIN FETCH` (watch N+1); return projections, not `Object[]`; guarded state transitions use a `@Modifying` update with an "expected status" condition. Lifecycle by status (ACTIVE/INACTIVE) instead of generic soft delete.

**Migrations**: new `V<n>__<description>.sql` following the repo's numbering, additive, named constraints (`uk_`, `fk_`, `chk_`, `idx_`), `CHECK` for enums, `TIMESTAMPTZ`, `gen_random_uuid()`. Never edit an applied migration. No mock data in versioned migrations unless profile-guarded.

**Transactions**: `@Transactional(readOnly = true)` at class level on services, `@Transactional` on write methods; no self-invocation; no remote calls inside a transaction.

**Security**: stateless JWT (access + refresh; refresh tokens stored hashed and revocable), BCrypt, secrets and expirations from properties (`security.*`, `app.*`), never from code. For new authorization use `authorizeHttpRequests` rules or method security (`@PreAuthorize`); fine-grained ownership/role checks in a validator called from the service. Typed `@ConfigurationProperties` records for settings. Profiles: `dev`, `prod`, `test`.

**Injection and wiring**: constructor injection via `@RequiredArgsConstructor`, stereotype annotations (`@Service`, `@Component`); no field `@Autowired`, no hand-wired `@Bean` per service. Jobs are thin: `@DisallowConcurrentExecution` or `@Scheduled`, cron and zone from properties, logic in a service.

**Logging**: `@Slf4j`, `{}` placeholders, `key=value` messages, never secrets or tokens.

**Tests** (a convention here is "every change ships with tests"):
- Layout `unit/{service,mapper,security,handler}` and `integration/{controller,repository,specification}`.
- Unit: `@ExtendWith(MockitoExtension.class)`, `@Mock` fields, build the `*Impl` in `@BeforeEach`, AssertJ, `verify` + `verifyNoMoreInteractions`. Names `method_scenario_shouldResult`.
- Integration: `@SpringBootTest` + `@AutoConfigureMockMvc` + `@ActiveProfiles("test")`, class-level `@Transactional`, `@WithMockUser(roles = ...)`, data created in `@BeforeEach` through repositories, `jsonPath` assertions. Prefer slices (`@WebMvcTest`, `@DataJpaTest`) when they are enough. Use Testcontainers PostgreSQL for repository and SQL tests; H2 hides Postgres behavior.
- Always cover failure paths (not found, validation, conflict, access denied). No `Thread.sleep`.

**Code hygiene**: no wildcard imports; no `Optional.get()` without a check; no null collections; small services (split when a class passes ~400 lines or mixes concerns); no "utils" classes that are services in disguise.

## Do not copy these habits (seen in older code)
Hand-written JSON error bodies in config classes; authorization in a servlet filter with hard-coded paths and a private `ObjectMapper`; repeated near-identical handlers in the exception advice; some 4xx cases not logged; resolving the same relations in create/update/patch by copy-paste (extract a helper); unused imports; inconsistent enum names across layers; typos in class names; static helper classes with business logic; casting `Object[]` rows.
