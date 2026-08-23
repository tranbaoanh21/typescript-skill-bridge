# Quality engineering

SkillBridge dùng nhiều lớp kiểm thử để mỗi loại rủi ro được kiểm tra ở nơi phù hợp nhất. Mục tiêu là phản hồi nhanh, deterministic và bảo vệ các workflow quan trọng; coverage chỉ là tín hiệu để phát hiện vùng thiếu kiểm thử, không phải điểm số sản phẩm.

## Testing pyramid

| Lớp         | Phạm vi                                                                   | Công cụ                            | Dữ liệu            |
| ----------- | ------------------------------------------------------------------------- | ---------------------------------- | ------------------ |
| Unit        | Domain helpers, validation và UI behavior độc lập                         | Vitest, Testing Library            | In-memory          |
| Integration | PostgreSQL constraints, transaction, auth, authorization và API workflows | Vitest, Supertest, PostgreSQL thật | `skillbridge_test` |
| Contract    | OpenAPI artifact và collection API công khai                              | OpenAPI check, Postman/Newman      | `skillbridge_test` |
| E2E         | Guest discovery và owner/applicant collaboration journey                  | Playwright Chromium                | `skillbridge_test` |

Database constraint tests không được thay bằng mock. Các luật về capacity, uniqueness, state transition và concurrent acceptance phải được chứng minh với PostgreSQL thật.

## Chạy quality gate

Quality gate không cần database:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run openapi:check
npm run security:audit
npm run build
```

Khởi động PostgreSQL test trước các suite tích hợp:

```bash
docker compose -f infrastructure/docker/compose.database.yaml up -d --wait
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run test:integration
TEST_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run postman:test
E2E_DATABASE_URL=postgresql://skillbridge:skillbridge@localhost:5434/skillbridge_test npm run test:e2e
```

Lần đầu chạy Playwright trên máy mới cần cài Chromium:

```bash
npx playwright install chromium
```

Playwright tự apply migration và chạy seed idempotent trước suite. Global setup sẽ từ chối database URL nếu tên database không chính xác là `skillbridge_test` để tránh thay đổi dữ liệu ngoài ý muốn.

## Critical browser journeys

- Guest tìm và mở project seed thật ở desktop, tablet và mobile breakpoints.
- Owner đăng ký, tạo và publish project.
- Student khác đăng ký, tìm project và gửi application.
- Owner đăng nhập lại, accept application và mở delivery board.
- Owner tạo task và chuyển task sang `IN_PROGRESS`.

Mutation journey chỉ chạy một lần trên desktop để giữ CI nhanh và deterministic; responsive discovery journey chạy trên cả ba viewport. Khi thất bại, Playwright giữ screenshot, video và trace. CI upload `playwright-report/` cùng `test-results/` trong bảy ngày.

## Coverage policy

API và web có threshold riêng trong Vitest config. Threshold ban đầu được đặt gần baseline đã đo để chặn coverage giảm âm thầm, sau đó tăng dần khi thêm behavior. Không viết test không có giá trị chỉ để tăng phần trăm.

Integration tests hiện là bằng chứng chính cho core API, nên số liệu V8 từ unit suite không phản ánh toàn bộ độ phủ backend. Mọi thay đổi domain phải chọn cấp test thấp nhất có thể chứng minh đúng rủi ro; thay đổi transaction hoặc database invariant vẫn cần integration test.

## Dependency policy

`npm run security:audit` kiểm tra production dependency với mức `high` trở lên. Dev-tool advisories được theo dõi riêng vì Newman và các tool test có thể giữ dependency transitively cũ; không dùng `npm audit fix --force` nếu nó gây breaking upgrade hoặc xóa test tooling. Dependabot kiểm tra npm và GitHub Actions hàng tuần.
