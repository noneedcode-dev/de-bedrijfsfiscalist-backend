# Auth & Security – V1 Checklist

### Auth & Security – V1 Checklist

- [ ]  `AppJwtPayload` interface’ini oluştur (`src/types/auth.ts`).
- [ ]  `authenticateJWT` middleware’ini `AppJwtPayload` ile type-safe hale getir.
- [ ]  `Request.user` için global type declaration ekle.
- [ ]  `sendError` helper’ını oluştur ve:
    - [ ]  `authenticateJWT`
    - [ ]  `apiKeyMiddleware`
    - [ ]  `validateClientAccess`
    - [ ]  `errorHandler`
    içinde kullan.
- [ ]  `apiKeyMiddleware`’i `x-api-key` üzerinden çalışan tek formatlı hale getir.
- [ ]  `validateClientAccess` logic’ini:
    - [ ]  admin → full access
    - [ ]  client → sadece kendi `client_id`
    şeklinde finalize et.
- [ ]  Rate limiter config dosyasını (`src/config/rateLimiter.ts`) oluştur.
- [ ]  `app.ts` içinde:
    - [ ]  `/health` → `healthLimiter`
    - [ ]  `/api` → `apiLimiter + apiKeyMiddleware + authenticateJWT`
    zincirini uygula.
- [ ]  Var olan endpointlerde path bazlı middlewarleri gözden geçir:
    - [ ]  `taxCalendar` routes
    - [ ]  `documents` routes
- [ ]  Postman / Thunder test senaryoları:
    - [ ]  JWT yok → 401
    - [ ]  Yanlış API key → 401
    - [ ]  Yanlış clientId (client rolü) → 403
    - [ ]  Admin rolü ile farklı clientId → 200
    - [ ]  Rate limit aşımı → 429 standard response

### Auth & Security – V1 Checklist

- [ ]  `AppJwtPayload` interface’ini oluştur (`src/types/auth.ts`).
- [ ]  `authenticateJWT` middleware’ini `AppJwtPayload` ile type-safe hale getir.
- [ ]  `Request.user` için global type declaration ekle.
- [ ]  `sendError` helper’ını oluştur ve:
    - [ ]  `authenticateJWT`
    - [ ]  `apiKeyMiddleware`
    - [ ]  `validateClientAccess`
    - [ ]  `errorHandler`
    içinde kullan.
- [ ]  `apiKeyMiddleware`’i `x-api-key` üzerinden çalışan tek formatlı hale getir.
- [ ]  `validateClientAccess` logic’ini:
    - [ ]  admin → full access
    - [ ]  client → sadece kendi `client_id`
    şeklinde finalize et.
- [ ]  Rate limiter config dosyasını (`src/config/rateLimiter.ts`) oluştur.
- [ ]  `app.ts` içinde:
    - [ ]  `/health` → `healthLimiter`
    - [ ]  `/api` → `apiLimiter + apiKeyMiddleware + authenticateJWT`
    zincirini uygula.
- [ ]  Var olan endpointlerde path bazlı middlewarleri gözden geçir:
    - [ ]  `taxCalendar` routes
    - [ ]  `documents` routes
- [ ]  Postman / Thunder test senaryoları:
    - [ ]  JWT yok → 401
    - [ ]  Yanlış API key → 401
    - [ ]  Yanlış clientId (client rolü) → 403
    - [ ]  Admin rolü ile farklı clientId → 200
    - [ ]  Rate limit aşımı → 429 standard response