# De Bedrijfsfiscalist – Backend v1

Bu backend, De Bedrijfsfiscalist portalının tüm kompleks iş mantığını, entegrasyonlarını ve veri işlemlerini yönetir.

## Hızlı Başlangıç

### Kurulum

```bash
# Bağımlılıkları yükle
npm install

# .env dosyasını oluştur (gerekli env değişkenlerini ekle)
cp .env.example .env
```

### Geliştirme

```bash
# Development mode (nodemon ile hot reload)
npm run dev
```

### Production

```bash
# TypeScript'i derle
npm run build

# Derlenmiş kodu çalıştır
npm start
```

### Linting

```bash
# Kodu kontrol et
npm run lint

# Hataları otomatik düzelt
npm run lint:fix
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

Server başarıyla başlatıldığında:
- 📍 http://localhost:3000 - Ana endpoint
- 📍 http://localhost:3000/health - Health check endpoint
- 📚 http://localhost:3000/api-docs - API Documentation (Development/Staging only)

---

## API Documentation

Interactive API documentation is available via Swagger UI in development and staging environments:

- **URL:** `http://localhost:3000/api-docs`
- **Environment:** Development and Staging only (not available in production)
- **Features:**
  - Interactive API explorer
  - Request/response schemas
  - Authentication examples
  - Try-it-out functionality

### Postman Collection

A Postman collection is available at `postman_collection.json` with:
- All API endpoints
- Authentication examples
- Positive and negative test cases
- Environment variables template

Import the collection into Postman or Thunder Client and set these variables:
- `baseUrl`: `http://localhost:3000`
- `apiKey`: Your `APP_API_KEY`
- `jwtToken`: Valid JWT token from Supabase
- `clientId`: Valid client UUID

---

## Logging

The application uses Winston for structured logging with different outputs based on environment:

### Development
- **Console output:** Colorized, human-readable format
- **Log level:** Debug

### Production
- **Console output:** JSON format for log aggregation
- **File outputs:**
  - `logs/combined-YYYY-MM-DD.log` - All logs (30 days retention, 20MB max per file)
  - `logs/error-YYYY-MM-DD.log` - Error logs only (14 days retention)
  - `logs/exceptions-YYYY-MM-DD.log` - Unhandled exceptions
  - `logs/rejections-YYYY-MM-DD.log` - Unhandled promise rejections
- **Log level:** Info

### Log Structure
```json
{
  "timestamp": "2025-12-02T10:30:00.000Z",
  "level": "info",
  "message": "Request completed",
  "method": "GET",
  "url": "/api/clients/123/tax/calendar",
  "status": 200,
  "duration": "45ms",
  "ip": "127.0.0.1"
}
```

---

## Security

### Authentication & Authorization

The API uses a multi-layer security approach:

1. **API Key Authentication** (`x-api-key` header)
   - Required for all `/api/*` endpoints
   - Validates that requests come from authorized clients (e.g., Bubble frontend)

2. **JWT Authentication** (Bearer token)
   - Required for all `/api/*` endpoints
   - Validates user identity and role
   - Issued by Supabase authentication

3. **Role-Based Access Control**
   - **Admin role:** Full access to all clients
   - **Client role:** Access only to their own `client_id`

### Security Headers

Helmet.js is configured to provide security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (production only)
- Content Security Policy (production only)

### Rate Limiting

Rate limits are applied per IP address:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/health` | 60 requests | 1 minute |
| `/api/*` | 100 requests | 15 minutes |
| Auth endpoints | 20 requests | 15 minutes |

Rate limit responses return `429 Too Many Requests` with retry information in headers:
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Requests remaining
- `RateLimit-Reset`: Time when limit resets

### Error Responses

All errors follow a standardized format:

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key",
  "statusCode": 401,
  "timestamp": "2025-12-02T10:30:00.000Z"
}
```

---

- Tüm **tax logic** (risk, calendar, control framework) burada çalışır.
- Dosya upload & ingestion (Excel → Supabase) burada yapılır.
- Supabase, güvenli multi-tenant veri deposu olarak kullanılır.
- Bubble frontend, bu backend'e REST API üzerinden bağlanır.

---

## Teknoloji Stack

- **Runtime:** Node.js (LTS)
- **Dil:** TypeScript
- **Framework:** Express (veya benzeri HTTP framework)
- **DB:** Supabase (Postgres + RLS, EU region)
- **Auth:** JWT (user context) + API key (Bubble ↔ Backend)
- **Queue / Jobs:** (v1 için) cron tabanlı job'lar veya basit scheduler
- **External Servisler:**
  - Google Drive (future: SharePoint)
  - S3 (Bubble file storage)
  - E-posta (SendGrid, vs.)

---

## Mimari Genel Bakış

Backend modüllere ayrılmıştır:

1. **Auth & Security**
   - Bubble'dan gelen istekleri `x-api-key` ile doğrular.
   - Kullanıcı context'ini temsil eden JWT üretir / doğrular (`sub`, `role`, `client_id`).
   - Supabase'e giderken bu JWT ile RLS devreye alınır.

2. **Clients & Users**
   - `clients`: müşteri firmalar
   - `app_users`: admin ve client kullanıcılar
   - Onboarding sırasında client + kullanıcı oluşturma iş akışı

3. **Files & Ingestion**
   - `/files/upload-from-url`: Bubble file URL → Drive/S3 → `documents` kaydı
   - `/tax/risk-control/import`: Excel dosyasından `tax_risk_control_rows` tablosunu doldurma (örnek endpoint'i aşağıda)

4. **Tax Modules**
   - **Tax Return Calendar**
     - `tax_return_calendar_entries` tablosunu yönetir.
     - Yaklaşan 3 aylık deadline'ları listeler.
   - **Tax Risk Matrix**
     - `tax_risk_matrix_entries`
     - Risk skorlarını ve renklerini hesaplar.
   - **Tax Risk Control Sheet**
     - `tax_risk_control_rows`
     - Excel ingestion + backend hesaplamaları (inherent_score, color, vs.)
   - **Tax Function**
     - `tax_function_rows`
     - Süreç tanımı, sorumlular, sıklık bilgileri

5. **Audit & Logging**
   - `audit_log`: mesaj, dosya indirme, config değişikliği vb. aksiyonların kaydı
   - Opsiyonel: harici log sistemi (Sentry, vs.)

6. **Jobs & Scheduler**
   - Günlük/haftalık:
     - Risk skorları recalculation
     - Yaklaşan deadline'lar için notification üretimi
   - Service role ile Supabase'e erişir (RLS bypass).

---

## Environment Değişkenleri

### Supabase

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` (kendi Supabase JWT'ni üretmek istersen)

### Backend Auth

- `APP_JWT_SECRET`       – Bubble ↔ Backend JWT'leri için
- `APP_JWT_ISSUER`       – (opsiyonel) `de-bedrijfsfiscalist-backend`
- `APP_JWT_AUDIENCE`     – (opsiyonel) `frontend` / `bubble`
- `APP_API_KEY`          – Bubble'ın backend'e gelirken kullandığı sabit key

### Dosya & Entegrasyonlar

- `GOOGLE_APPLICATION_CREDENTIALS` veya `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`
- `S3_BUCKET_NAME`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_REGION`

### Bildirimler (opsiyonel)

- `SENDGRID_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SIGNING_SECRET`

### Diğer

- `NODE_ENV` = `development` / `production`
- `PORT`     = default 3000
- `LOG_LEVEL` = `info` / `debug` / `error`
- `FRONTEND_URL` = Frontend URL for invitation emails (e.g., `https://version-test.yourapp.bubbleapps.io` for Bubble.io)

---

## Klasör Yapısı (Öneri)

```txt
src/
  index.ts                # app bootstrap
  config/
    env.ts                # env okumaları
  lib/
    supabaseClient.ts     # supabaseAdmin + createSupabaseUserClient
    excel.ts              # ortak excel parse helper'ları
    jwt.ts                # backend JWT işlevleri
  modules/
    auth/
      auth.controller.ts
      auth.service.ts
    clients/
      clients.controller.ts
      clients.service.ts
    files/
      files.controller.ts
      files.service.ts
    tax/
      calendar.controller.ts
      calendar.service.ts
      riskControl.controller.ts
      riskControl.service.ts
      riskMatrix.controller.ts
      riskMatrix.service.ts
      function.controller.ts
      function.service.ts
    audit/
      audit.service.ts
  jobs/
    recalculateRiskScores.job.ts
  routes.ts               # tüm route tanımları
```
