# Docker local runtime

Phase 9 cung cấp một runtime gần production cho API và một local infrastructure stack có health checks. PostgreSQL vẫn là source of truth; Redis và RabbitMQ được khởi động sẵn cho các phase distributed systems tiếp theo nhưng API hiện chưa ghi dữ liệu nghiệp vụ vào hai service này.

## Service topology

```mermaid
flowchart LR
    Client[Web / Postman] --> API[API container\nnon-root Node user]
    PG[(PostgreSQL)] -->|healthy| Migrate[Migration job]
    Migrate -->|exit 0| API
    Redis[(Redis)] -->|healthy| API
    Rabbit[(RabbitMQ)] -->|healthy| API
    TestPG[(PostgreSQL test\nprofile: test)] --> TestMigrate[Migration test job]
```

Compose bảo đảm PostgreSQL healthy trước migration và chỉ start API sau khi migration exit `0`, Redis healthy và RabbitMQ healthy. API readiness tiếp tục query PostgreSQL thật.

## Quick start

Yêu cầu Docker Desktop có Compose v2. Từ repository root:

```bash
npm run docker:up
npm run docker:seed
```

Các endpoint local:

- API: `http://localhost:3000`
- Readiness: `http://localhost:3000/health/ready`
- Swagger UI: `http://localhost:3000/docs`
- PostgreSQL: `localhost:5433`
- Redis: `localhost:6379`
- RabbitMQ AMQP: `localhost:5672`
- RabbitMQ Management: `http://localhost:15672`

Xem trạng thái và log:

```bash
docker compose -f infrastructure/docker/compose.yaml ps -a
docker compose -f infrastructure/docker/compose.yaml logs -f api
docker compose -f infrastructure/docker/compose.yaml logs migrate
```

Dừng containers nhưng giữ named volumes:

```bash
npm run docker:down
```

Không thêm `--volumes` trừ khi chủ động muốn xóa toàn bộ PostgreSQL, Redis và RabbitMQ local data.

## Environment

Compose có local-only defaults để onboarding nhanh. Không dùng các password hoặc JWT secret mặc định khi deploy. Để tùy chỉnh, copy file mẫu rồi truyền rõ env file:

```bash
cp infrastructure/docker/.env.example infrastructure/docker/.env
docker compose --env-file infrastructure/docker/.env -f infrastructure/docker/compose.yaml up -d --build --wait
```

File `.env` không được commit. Secrets production phải nằm trong deployment environment/secret store, không bake vào image hoặc ghi vào Compose đã commit.

## Migration and seed policy

Migration là job one-shot dùng chính immutable API image:

```bash
docker compose -f infrastructure/docker/compose.yaml run --rm migrate
npm run docker:seed
```

Migration command idempotent và chạy trước API trong normal startup. Seed cũng idempotent nhưng là thao tác chủ động, không tự chạy khi production container khởi động.

## Test database profile

Khởi động PostgreSQL test tạm thời trên cổng `5434`:

```bash
npm run docker:test-db
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run test:integration
```

Test service dùng `tmpfs`, vì vậy data biến mất khi container bị xóa. Không chạy đồng thời `compose.database.yaml` cũ và full `compose.yaml`, vì cả hai mặc định dùng cổng `5433`/`5434`.

## Image design and review

`Dockerfile.api` có các stage tách biệt:

1. Development dependencies chỉ dùng để compile TypeScript.
2. Production dependencies chỉ cài dependency cần cho API và database workspace.
3. Runtime chỉ copy compiled JavaScript, SQL migrations và production `node_modules`.

Runtime dùng Debian slim vì API có native `argon2`, chạy user `node` UID 1000, có built-in HTTP health check và không chứa source `.env`, TypeScript, Vitest hay Newman. Image ARM64 được đo ở khoảng 293 MB tại Phase 9; đây là baseline để theo dõi, không phải mục tiêu tối ưu bằng mọi giá.

Worker chưa có nghiệp vụ ở Phase 9 nên chưa tạo một container placeholder. Phase 12 sẽ bổ sung worker multi-stage target từ code thật và tái sử dụng nguyên tắc production-only/non-root này.

## Troubleshooting

- `port is already allocated`: dừng Compose database-only cũ hoặc đổi port trong env file.
- API không start: xem `migrate` log trước, sau đó kiểm tra health của PostgreSQL/Redis/RabbitMQ.
- RabbitMQ cần nhiều thời gian hơn PostgreSQL khi start lần đầu; `--wait` sẽ chờ health check thay vì đoán bằng sleep.
- Database dev cần được quản lý bằng pgAdmin 4: kết nối `localhost:5433`, database/user/password mặc định đều là `skillbridge`.
