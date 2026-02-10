# PR: Tax Function → RACI (minimal diff)

### 0) Branch/PR adı

`feat/tax-function-raci`

---

## 1) Supabase migration (DB)

### ✅ Yeni dosya

`supabase/migrations/20260128_add_tax_function_raci.sql`

**Yapılacaklar**

1. Kolon ekle:
- `accountable text[]`
- `consulted text[]`
- `informed text[]`
1. Client write policy kaldır:
- `DROP POLICY IF EXISTS "tax_function_client_modify_own" ON public.tax_function_rows;`

> Select policy kalsın, admin full access kalsın.
> 

**Acceptance**

- Client JWT ile insert/update/delete DB’de engellenir.
- Admin her şeyi yapar.

---

## 2) Backend: constants (UI kolonları RACI)

### Değiştir

`src/modules/taxFunction/taxFunction.constants.ts`

**Şunu değiştir:**

```tsx
exportconstTAX_FUNCTION_COLUMNS = [
  {key:'process',label:'Process' },
  {key:'r',label:'R' },
  {key:'a',label:'A' },
  {key:'c',label:'C' },
  {key:'i',label:'I' },
  {key:'notes',label:'Notes' },
]asconst;

```

> description/frequency/deadline/status/responsible_party kalkıyor (Bubble UI artık RACI).
> 

---

## 3) Backend: repository typings + insert/update payload

### Değiştir

`src/modules/taxFunction/taxFunctionRows.repository.ts`

**TaxFunctionRow ve TaxFunctionRowInsert içine ekle:**

- `accountable?: string[]`
- `consulted?: string[]`
- `informed?: string[]`

**insertMany/insertOne** payload’a ekle:

- `accountable: row.accountable`
- `consulted: row.consulted`
- `informed: row.informed`

**updateById** içine ekle:

- `if (updates.accountable !== undefined) updateData.accountable = updates.accountable;`
- `if (updates.consulted !== undefined) updateData.consulted = updates.consulted;`
- `if (updates.informed !== undefined) updateData.informed = updates.informed;`

---

## 4) Backend: service mapping (GET + import + create/update types)

### Değiştir

`src/modules/taxFunction/taxFunction.service.ts`

### 4.1 GET response mapping’i RACI yap

`cells` mapping’i şöyle olmalı:

- `process: row.process_name`
- `r: row.stakeholders?.join(', ') || ''` ✅ (stakeholders → R)
- `a: row.accountable?.join(', ') || ''`
- `c: row.consulted?.join(', ') || ''`
- `i: row.informed?.join(', ') || ''`
- `notes: row.notes || ''`

> description/responsible_party/frequency/deadline/status çıkar.
> 

### 4.2 Import mapping (hem yeni hem eski key’leri kabul et)

`mapCellsToRowInsert()` içinde:

- R kaynağı:
    - `cells.r` **veya** `cells.responsible_party` (eski import kırılmasın)
- A/C/I kaynağı:
    - `cells.a`, `cells.c`, `cells.i`

String parse helper kullan:

- `"John, Jane"` → `['John','Jane']`

Insert objesine ekle:

- `stakeholders: parsedR`
- `accountable: parsedA`
- `consulted: parsedC`
- `informed: parsedI`

### 4.3 CreateRowInput / UpdateRowInput genişlet

`CreateRowInput` ve `UpdateRowInput`’a ekle:

- `accountable?: string[]`
- `consulted?: string[]`
- `informed?: string[]`

`createRow()` insertData’ya ekle (repo insertOne’a gidecek):

- `accountable/consulted/informed`

---

## 5) Backend: routes (write admin-only + payload normalize)

### Değiştir

`src/modules/taxFunction/taxFunction.routes.ts`

### 5.1 Admin guard ekle

Import et:

```tsx
import { requireRole }from'../auth/auth.middleware';

```

Aşağıdaki route’lara `requireRole('admin')` ekle:

- `POST /import`
- `POST /rows`
- `PATCH /rows/reorder`
- `PATCH /rows/:id`
- `DELETE /rows/:id`

Örnek:

```tsx
taxFunctionRouter.post('/import',requireRole('admin'), [ ...validators ], ...)

```

### 5.2 rows create/update’de A/C/I normalize et

`POST /rows` ve `PATCH /rows/:id` body’ye opsiyonel alanlar:

- `accountable`, `consulted`, `informed` (array veya comma-separated string)

Normalize mantığı `stakeholders` gibi:

- string → split/trim/filter
- array → only strings

Payload’a ekle:

- `accountable: normalizedAccountable`
- `consulted: normalizedConsulted`
- `informed: normalizedInformed`

---

## 6) Tests güncellemesi

### 6.1 GET columns testi

`tests/taxFunction.test.ts`

Beklenen columns artık:

```tsx
[
  {key:'process',label:'Process' },
  {key:'r',label:'R' },
  {key:'a',label:'A' },
  {key:'c',label:'C' },
  {key:'i',label:'I' },
  {key:'notes',label:'Notes' },
]

```

### 6.2 Client write block test’i ekle

`tests/taxFunction.rows.test.ts` içinde:

- client role + own client_id ile `POST /rows` → **403**
- client role + own client_id ile `POST /import` → **403** (ayrı test de olabilir)

> Şu an “başka client’a erişince 403” var; buna ek olarak “kendi client’ında bile write 403” eklenecek.
> 

---

## 7) Quick verification (lokalde)

- Migration apply
- `pnpm test` veya projedeki test komutu
- Smoke:
    - Admin token ile `GET /tax/function` → RACI columns + cells dolu
    - Client token ile `GET` → 200
    - Client token ile `POST /rows` → 403
    - Admin token ile `POST /import` → 200