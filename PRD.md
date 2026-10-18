# Ayyaz Pharmacy Manager — Product Requirements Document

**Version:** 1.2 (draft) · **Date:** 2026-10-18 · **Owner:** Muzammil Ameen

**Changes in 1.2:** "Sale price only" now means the price already includes GST, and the GST part is worked out of it · encryption of the database and backups confirmed, with a recovery key.

**Changes in 1.1:** GST choice when entering prices · CSV/Excel import moved into the MVP · 80mm printer confirmed · FBR made an optional module · new sections for the design concept (§5) and engineering & security standards (§6).

---

## 1. Overview

**Product:** Ayyaz Pharmacy Manager is an offline Windows desktop app for one retail pharmacy in Pakistan.

**Problem:** Billing by hand is slow. Nobody can see stock levels as they change. Expired medicines get missed on the shelves. Daily profit and cash are hard to work out.

**Goals**
- Bill a customer in under 30 seconds.
- Never sell an expired item.
- Show stock and today's sales and profit at any time.
- Load the whole medicine list from a spreadsheet in minutes, not days.
- Never lose data, even during power cuts.

**Non-goals (v1):** online or cloud sync, multiple branches, customer credit (udhaar), a mobile app. FBR integration is an **optional module**, not part of v1 (see §3.11).

### Key decisions

| Topic | Decision |
|---|---|
| Deployment | 1 shop, 1 PC, fully offline |
| Platform / stack | Windows desktop app: Electron + React + TypeScript + SQLite, always on the latest stable versions |
| Item entry at POS | Barcode scanner, brand-name search, and generic/salt search to find alternatives |
| Units | Sold by box, strip or tablet, with prices split automatically |
| GST | Default 18%. When entering a price, the Owner chooses **Add GST** (GST added on top) or **Sale price only** (GST already included in the price). Either way the rate is 18% unless he types another |
| Encryption | Database and backups encrypted, with a printable recovery key |
| Bulk data entry | Upload a CSV or Excel (.xlsx) sheet, using a downloadable template |
| Users | English UI; two roles: Owner and Staff |
| Printer | **80mm thermal** for receipts; A4 for reports |
| Backup | Automatic daily local backup, plus a copy to USB |
| Extra workflows | Customer returns and refunds; daily expenses and cash close |
| FBR | Optional module, off by default; the data model is ready for it |
| Release strategy | MVP = POS + inventory + import; Phase 2 = purchases, suppliers, full reports, expenses |

---

## 2. Users & roles

| Role | Can do |
|---|---|
| **Owner / Admin** | Everything: prices, GST settings, purchase cost, profit, reports, data import, users, settings, backups, approving voids and refunds |
| **Staff / Cashier** | POS sales, item lookup, returns (within limits), viewing stock quantity. Cannot see cost price or profit, change prices, or import data |

- Users log in with a username and PIN. The app locks itself after a period of inactivity.
- The app logs every action against the user who did it.
- Permissions are checked in the app's back end (main process), not only hidden in the UI (see §6.2).

---

## 3. Functional requirements

### 3.1 Item / medicine master — *MVP*
- **Fields:** brand name, generic/salt name(s), strength, form (tab, cap, syrup, injection, cream…), manufacturer, category, barcode(s), rack/shelf location, GST mode and rate (§3.2), reorder level, and a flag for items that need a prescription.
- **Pack structure:** tablets per strip and strips per box (e.g. 1 box = 10 strips × 10 tablets). The selling price is set per box. Strip and tablet prices are worked out automatically, and the Owner can override them.
- **Search:** by brand, generic or barcode.
- **Alternatives view:** shows other brands with the same generic and strength, with their stock and price.

### 3.2 Pricing & GST — *MVP*
Whenever the Owner enters or changes a selling price (new item, stock entry, purchase, or import), the form asks him to choose a **price mode**:

| Mode | What the Owner enters | What the customer pays | What the receipt shows |
|---|---|---|---|
| **Add GST** | Base price + GST rate (pre-filled **18%**, can be changed to any value, e.g. 5% or 17%) | Base price + GST | Base rate, GST % and GST amount on that line |
| **Sale price only** (GST included) | Final sale price + GST rate included in it (pre-filled **18%**, can be changed) | The sale price as entered, nothing added | Price, GST % and the GST amount contained in it |

- **Working out the GST in "Sale price only" mode:** GST = price × rate ÷ (100 + rate), and base = price − GST. Example at 18%: Rs 118.00 → GST Rs 18.00, base Rs 100.00.
- **GST-exempt medicines:** use either mode with the rate set to **0%**. The receipt then shows GST as "—".
- The form shows a live preview:
  - Add GST: *Base Rs 100.00 + GST 18% (Rs 18.00) = **Rs 118.00***
  - Sale price only: *Rs 118.00 (includes GST 18% = Rs 18.00, base Rs 100.00)*
- The mode and rate are saved on the item. They are filled in automatically next time, and the Owner can still change them for a particular batch.
- Settings hold the shop-wide default mode and rate (default: Add GST, 18%).
- GST is worked out per line and rounded to the nearest paisa. In "Sale price only" mode the customer pays exactly the printed price; any paisa rounding goes into the GST/base split, never into the total.
- When a discount is given in "Sale price only" mode, GST is worked out again from the discounted price. The receipt and the GST report show total GST for the bill.
- The mode and rate in force when a sale is made are copied onto the sale line, so later price changes never alter past invoices.
- Changing a price, mode or rate is written to the audit log (old value → new value, who, when).

### 3.3 Inventory, batches & expiry — *MVP*
- Stock is tracked per **batch**: batch no., expiry date, cost price, sale price + price mode/GST rate, and quantity (stored in the smallest unit).
- **FEFO (first expiry, first out):** by default, a sale takes stock from the batch that expires first. The cashier can pick a different batch.
- The POS blocks expired batches. Batches that expire within N days (configurable, default 90) show a warning.
- **Dashboard alerts:** low stock (at or below the reorder level), items near expiry, expired items.
- Stock adjustments (damage, loss, count correction) need a reason and Owner approval.
- Opening stock is entered by hand on its own screen, or loaded in bulk (§3.4).

### 3.4 Data import (CSV / Excel) — *MVP*
For loading the full medicine list and opening stock quickly. **Owner only.**

1. **Download a template**: an .xlsx/.csv with the right column headers, an example row and instructions.
2. **Upload** a `.csv` or `.xlsx` file (up to 10 MB and 50,000 rows).
3. **Map columns**: the app guesses which column is which from the headers, and the Owner confirms or corrects it. The mapping can be saved for next time.
4. **Choose GST handling** for the file: use the `gst_mode` / `gst_rate` columns if the sheet has them; otherwise apply one choice to every row (*Add GST at __%* or *Sale price only, GST __% included*).
5. **Preview & validate**: every row is checked before anything is saved. Rows are marked ✅ ready, ⚠️ warning (e.g. expiry within 90 days, barcode already used) or ❌ error (e.g. missing name, invalid date, negative price). The Owner can fix errors in the grid or skip those rows.
6. **Duplicates**: rows are matched by barcode first, then by brand + strength + form. The Owner chooses to *skip*, *update existing* or *add as new*.
7. **Import**: everything is saved in a single database transaction, so either all valid rows are saved or none are. A backup is taken automatically first.
8. **Result report**: how many rows were added, updated and skipped, with a downloadable error file for any rejected rows.

**Template columns:** `brand_name*`, `generic_name`, `strength`, `form`, `company`, `category`, `barcode`, `rack`, `tabs_per_strip`, `strips_per_box`, `sale_price_box*`, `gst_mode` (`add_gst` / `price_only`, where `price_only` means GST is included), `gst_rate`, `reorder_level`, `rx_required`, and for opening stock: `batch_no`, `expiry` (MM/YYYY or DD/MM/YYYY), `qty`, `qty_unit` (box/strip/tab), `cost_price_box`. (* = required.)

Safety rules: files are read as data only. Formulas and macros are never run (only the cell values are read). Text is trimmed, cleaned and checked for length. When the app exports a CSV, any cell that starts with `= + - @` is escaped so it can't run as a formula in Excel (CSV injection).

### 3.5 Point of Sale — *MVP*
- **Keyboard-first flow:** scan or type → pick the item → choose the unit (box, strip or tablet) → enter quantity → next item. Shortcuts for pay, hold, discount and search (see §5.4).
- **Discounts:** per line or for the whole bill, as % or Rs. The Owner sets the maximum discount staff can give. Discounts are applied before GST.
- **Payments:** cash (the app shows the change due), card, and JazzCash, Easypaisa or bank transfer. Non-cash payments are only recorded; the app doesn't connect to those services.
- Bills can be held and recalled. A bill can include the customer's name and phone and the doctor's name.
- **80mm thermal receipt** (72mm printable width, about 48 characters per line): shop name, address, phone and licence no.; invoice no., date/time and cashier; for each item: name, batch, expiry, qty, unit, rate, GST and amount; then subtotal, discount, total GST, net total, amount paid, change and a footer note. Space is kept for an FBR QR code and number (§3.11). Receipts can be reprinted.
- Invoice numbers run in sequence and can't be edited. Cancelling (voiding) a bill needs the Owner's PIN, and the app keeps an audit record of it.

### 3.6 Returns & refunds — *MVP*
- Find the original invoice → choose the items and quantities being returned → the stock goes back into its original batch → print a refund receipt. Expired or damaged returns are written off instead of restocked.
- The refund uses the price and GST from the original sale line.
- The return window and the amount above which a return needs Owner approval are configurable.

### 3.7 Purchases & suppliers — *Phase 2*
- Supplier/distributor records: name, contact, NTN, area.
- **Purchase entry from a distributor bill:** items, batch, expiry, qty, bonus/free qty, trade price, discount, purchase GST, and the price mode for the new sale price (§3.2). Saving it creates the batches and updates stock.
- Returns of purchased stock to the supplier.
- **Supplier ledger:** bills, payments, balance due.
- **Reorder suggestions:** a list based on low stock and how fast items have been selling recently.

### 3.8 Expenses & daily cash close — *Phase 2*
- Expense entry with categories (rent, electricity, salaries, tea, etc.).
- **End-of-day close:** the app works out expected cash as opening cash + cash sales − cash refunds − cash expenses − cash paid to suppliers. The cashier enters the cash they counted, the app records any difference, and it prints a Z-report on the 80mm printer.

### 3.9 Reports
- **MVP:** today's sales summary, sales by date range, current stock value, near-expiry and expired items, low stock, GST collected.
- **Phase 2:** profit by day, item and company (using batch cost), top-selling items, slow-moving and dead stock, detailed GST report, purchase summary, supplier balances, expense report, cash-close history, user activity/audit log.
- Reports can be exported to PDF, Excel and CSV, and printed on A4.

### 3.10 Settings & admin
- **Shop profile:** name, address, phone, drug-sale licence no., NTN/STRN, receipt footer, logo.
- **Tax:** default price mode and GST rate (18%).
- Users and roles, expiry-warning days, discount limits, receipt printer selection and a test print.

### 3.11 FBR integration — *Optional module (deferred)*
- Off by default and not part of v1. It is built as a separate module that can be switched on later without changing the database.
- What's already in place for it: invoice numbers in sequence, GST stored per line, the shop's NTN/STRN in settings, empty FBR fields on each sale (`fbr_invoice_no`, `fbr_status`, `fbr_synced_at`), and space for the QR code on the receipt.
- When switched on: each invoice is sent to the FBR POS API. If the internet is down, invoices queue up and are retried. The FBR number and QR code are printed on the receipt.

### 3.12 Backup & recovery — *MVP*
- The app backs up automatically when it closes and once a day at a set time. Backups go to a local folder, and a copy goes to a USB drive when one is plugged in. The last 30 backups are kept.
- A backup is also taken before every import (§3.4) and before every restore.
- One-click manual backup and restore (Owner only, with a confirmation step). Each backup is checked (SQLite integrity check plus a checksum) before it counts as successful.
- The database runs in SQLite WAL mode, so a power cut during load-shedding won't corrupt it.

---

## 4. Non-functional requirements

| Area | Requirement |
|---|---|
| Connectivity | Works fully offline |
| Hardware | Windows 10/11, 4 GB RAM, runs on older CPUs |
| Performance | Search results in under 200 ms with 20,000+ items; ready to use within 5 s of starting; importing 10,000 rows takes under 30 s |
| Scanner | Works with any USB barcode scanner that acts as a keyboard, with no special driver needed |
| Money | Stored as whole paisa (integers), never floating-point; shown as "Rs 1,234.50" |
| Usability | Large, readable UI that can be used entirely from the keyboard at the counter |
| Install / update | One .exe installer; updates can be installed from a file or USB, with no internet needed |
| Security | See §6.2 |

---

## 5. Design concept

### 5.1 Principles
1. **Speed at the counter comes first.** The POS screen is built for a cashier working with a queue of customers: few clicks, keyboard shortcuts everywhere, and focus that returns to the search box automatically.
2. **Calm and clinical.** Clean, uncluttered and trustworthy, like a well-run pharmacy. Colour is used for meaning (alerts, totals), not decoration.
3. **Mistakes are hard to make.** Expired stock is blocked, price changes need confirming, risky actions ask for the Owner's PIN, and there's an undo wherever possible.
4. **Readable from a distance.** Large type for totals and quantities; the screen works under bright shop lighting.
5. **One design system.** Every screen uses the same components, spacing and colours, so new modules look consistent from the start.

### 5.2 Visual language

| Element | Choice |
|---|---|
| Primary colour | Pharmacy teal-green `#0F766E` (actions, active nav, focus) |
| Neutrals | Slate scale; background `#F8FAFC`, surfaces white, text `#0F172A` |
| Status colours | Success `#16A34A` · Warning (near expiry, low stock) `#D97706` · Danger (expired, errors, void) `#DC2626` · Info `#2563EB` |
| Theme | Light by default; dark mode available (colours defined once as tokens so both themes stay in sync) |
| Typography | **Inter**, bundled with the app (no internet needed). Numbers use tabular figures so prices line up in columns. Base size 15px; the POS total is 40px or larger |
| Shape & spacing | 8px spacing grid, 8px corner radius, light borders, very little shadow |
| Icons | Lucide icon set, always paired with a text label in navigation |
| Contrast | All text meets WCAG AA contrast; status is never shown by colour alone (always with an icon or label too) |

### 5.3 Layout & navigation
- **App shell:** a left sidebar with icon + label (Dashboard, POS, Items, Inventory, Import, Returns, Reports, Settings); a top bar showing the user, today's date, backup status and the lock button. Staff only see the modules their role allows.
- **POS** opens full-screen and hides the sidebar to give the bill as much room as possible.

**POS screen wireframe**
```
┌───────────────────────────────────────────────────────────────────────┐
│ Ayyaz Pharmacy · POS            Cashier: Ali   18-Oct-2026 14:32  🔒  │
├───────────────────────────────────────────────┬───────────────────────┤
│ 🔍 Scan barcode or search brand / generic… F2 │  Invoice #000245      │
├───────────────────────────────────────────────┤  Customer: (optional) │
│ #  Item              Batch  Exp    Unit  Qty  │  Doctor:   (optional) │
│ 1  Panadol 500mg     B123   03/27  Strip  2   │───────────────────────│
│ 2  Augmentin 625     A991   11/26  Box    1 ⚠ │  Subtotal  Rs 1,420.00│
│ 3  Brufen 400mg      X55    08/27  Tab   10   │  Discount  −Rs  20.00 │
│                                               │  GST         Rs 251.00│
│                                               │  ─────────────────────│
│                                               │  TOTAL               │
│                                               │  Rs 1,651.00          │
├───────────────────────────────────────────────┤───────────────────────│
│ F3 Alternatives  F4 Discount  F6 Hold  F7 Recall  F9 Return  F12 PAY  │
└───────────────────────────────────────────────────────────────────────┘
```

**Item entry: price & GST block**
```
┌─ Price & GST ─────────────────────────────────────────┐
│ Price mode:  (●) Add GST     ( ) Sale price only      │
│ Base price (per box):  [ 100.00 ]                     │
│ GST rate:              [  18 ] %   (default 18%)      │
│ ───────────────────────────────────────────────────── │
│ Base Rs 100.00 + GST Rs 18.00  =  Final Rs 118.00     │
│ Per strip Rs 11.80 · Per tablet Rs 1.18               │
└───────────────────────────────────────────────────────┘

┌─ Price & GST ─────────────────────────────────────────┐
│ Price mode:  ( ) Add GST     (●) Sale price only      │
│ Sale price (per box):  [ 118.00 ]                     │
│ GST included:          [  18 ] %   (default 18%)      │
│ ───────────────────────────────────────────────────── │
│ Rs 118.00  includes GST Rs 18.00 · base Rs 100.00     │
│ Per strip Rs 11.80 · Per tablet Rs 1.18               │
└───────────────────────────────────────────────────────┘
```

**Import wizard:** a 5-step progress bar (*Upload → Map columns → GST → Preview → Done*). The preview is a virtualised grid with filter chips for ✅ / ⚠️ / ❌ rows.

### 5.4 Keyboard map (POS)

| Key | Action | Key | Action |
|---|---|---|---|
| F2 | Focus search | F7 | Recall a held bill |
| F3 | Alternatives (same generic) | F8 | Change the batch on this line |
| F4 | Discount | F9 | Return / refund |
| F5 | Change unit (box/strip/tab) | F12 | Pay |
| F6 | Hold bill | Esc | Cancel / close dialog |
| ↑ ↓ | Move between lines | Del | Remove line (asks to confirm) |
| + / − | Change quantity | Ctrl+L | Lock screen |

### 5.5 Feedback & states
- **Toasts** confirm successful actions; errors stay on screen until dismissed and say what to do next.
- **Empty states** explain the next step (e.g. "No items yet. Import a spreadsheet or add one").
- **Confirmation dialogs** for destructive actions name exactly what will happen ("Void invoice #000245 for Rs 1,651?").
- A short beep confirms a successful scan; a different tone sounds for "item not found" or "expired".

### 5.6 Receipt design (80mm)
- Monospace layout, about 48 characters per line, with the logo printed in black and white.
- Header: shop name (large), address, phone, licence no., NTN.
- Item lines use two rows: the name on the first, then `qty × rate   GST   amount` on the second.
- The **NET TOTAL** is printed in large bold type. The footer has the return policy, a thank-you note and the reserved space for FBR.

---

## 6. Engineering standards & security

### 6.1 Code quality, reuse & scalability
- **Latest stable versions:** before adding any dependency, check its current latest stable version and use it. Node.js runs on the current LTS release. The lockfile is committed, Renovate/Dependabot-style update checks happen regularly, and `npm audit` must pass with no high or critical issues.
- **TypeScript in strict mode** everywhere; no `any` without a written reason. ESLint (typescript-eslint, strict rules) and Prettier run in a pre-commit hook and in CI.
- **Layered architecture:** UI → typed IPC → service layer (business rules) → repository layer (database). Business rules (pricing, GST, unit conversion, FEFO, cash close) are **pure functions in `shared/domain`**, with no Electron or React dependencies, so they can be tested and reused, for example by a future web or mobile version.
- **One source of truth for data shapes:** Zod schemas define every IPC request and response, and the TypeScript types come from them, so the UI and back end can't drift apart.
- **Feature modules:** each feature (pos, items, inventory, import, returns, reports, settings, fbr) has its own folder holding its UI, IPC handlers, service and tests, so a new module can be added without touching others.
- **Shared UI kit:** reusable components (DataGrid, MoneyInput, PriceModeField, ConfirmDialog, KeyboardShortcut…) are built on shadcn/ui with design tokens from §5.2.
- **Database:** versioned Drizzle migrations, foreign keys turned on, indexes on search columns, and full-text search (FTS5) for item search. Every multi-step change (sale, import, return) runs in one transaction.
- **Testing:** unit tests for all domain functions (aiming for ≥ 90% coverage of `shared/domain`), integration tests for services against a temporary SQLite database, and end-to-end tests (Playwright) for the POS, import and return flows.
- **Error handling & logging:** typed error results from services. Logs are structured and rotated, and contain no PINs or secrets.

### 6.2 Security

| Area | Measure |
|---|---|
| Electron hardening | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`; a strict Content-Security-Policy; no remote content loaded; navigation and new windows blocked; Electron Fuses set (no `RUN_AS_NODE`, ASAR integrity checked, cookie encryption on) |
| IPC | Only a small allowlisted API is exposed through `contextBridge`. **Every IPC call is validated with Zod and checked against the user's role in the main process.** The renderer is never trusted |
| Authentication | PINs hashed with a slow, salted algorithm (Node's built-in `scrypt`, or argon2); never stored or logged in plain text; lockout after 5 wrong attempts; auto-lock when idle; Owner PIN needed for voids, refunds above the limit, price changes and restores |
| Data at rest | **Required.** The database and every backup are encrypted with SQLCipher (AES-256, via a maintained better-sqlite3 build that supports it). The key is stored protected by Windows DPAPI (Electron `safeStorage`), so the app opens without asking for it |
| Recovery key | At first setup the app creates a **recovery key** and makes the Owner save it before continuing: printed on paper and/or saved as a file on USB, and he must type part of it back to confirm. Restoring a backup on a new or reinstalled PC needs this key. The Owner can view or regenerate it later (Owner PIN required); regenerating re-encrypts the database and makes a fresh backup. The setup screen and the backup settings both warn clearly that **without the recovery key, backups cannot be opened** |
| Database access | Parameterised queries only (through Drizzle); no SQL built from strings |
| File import | Extension, MIME type and size checked; cell values only (no formulas or macros); every field validated; CSV/Excel export escapes formulas |
| Audit trail | The audit log can only be added to (no edits or deletes, enforced by database triggers). It covers logins, price/GST changes, voids, refunds, stock adjustments, imports, backups and restores |
| Supply chain | Only minimal, well-maintained dependencies; lockfile pinned; `npm audit` in CI; installers code-signed |
| Updates | Offline update packages are checked against a signature before they're installed |

---

## 7. Data model (core tables)

| Area | Tables |
|---|---|
| System | `users`, `settings`, `audit_log` |
| Catalogue | `items`, `item_barcodes`, `generics`, `item_generics`, `companies` |
| Stock | `batches`, `stock_movements` |
| Sales | `sales`, `sale_lines`, `held_bills`, `returns`, `return_lines` |
| Import | `import_jobs`, `import_mappings` |
| Purchasing | `suppliers`, `purchases`, `purchase_lines`, `supplier_payments` |
| Cash | `expenses`, `cash_closes` |

- **Pricing fields** on `items` and `batches`: `price_mode` (`add_gst` | `price_only`, i.e. GST added on top or GST included), `gst_rate_bp` (rate stored in basis points, e.g. 1800 = 18%), `base_price_paisa`, `final_price_paisa`.
- **`sale_lines`** copy `price_mode`, `gst_rate_bp`, `unit_price_paisa`, `gst_paisa` and `discount_paisa` at the moment of sale.
- **`sales`** has empty FBR fields: `fbr_invoice_no`, `fbr_status`, `fbr_synced_at`.
- `stock_movements` is the only record of stock going in and out. Every row has a type (sale, return, purchase, import, adjustment…) and links to the record that caused it. Stock on hand for a batch is the sum of its movements; that total is also kept in `batches.qty`, updated in the same database transaction as the movement.

---

## 8. Technical architecture

| Layer | Choice (latest stable at setup time) |
|---|---|
| Shell | **Electron** with **electron-vite** for building. The main process handles the database, printing, import parsing and backup jobs |
| UI | **React + TypeScript + Vite**, **Tailwind CSS** + **shadcn/ui**, **TanStack Table** + TanStack Virtual for grids, **TanStack Query** for data fetching, **React Hook Form + Zod** for forms |
| Main ↔ UI bridge | Typed IPC through a preload script, with Zod-validated contracts in `shared/ipc` |
| Database | **SQLite** through `better-sqlite3` (or its SQLCipher-capable build), with **Drizzle ORM** for the schema and migrations |
| Import | **exceljs** for .xlsx and **Papa Parse** for CSV, run in a worker thread so the UI stays responsive |
| Receipts | HTML template for 80mm printed silently with Electron's `webContents.print`; `node-thermal-printer` (ESC/POS) as a fallback |
| Reports | PDF through `printToPDF`; Excel through `exceljs` |
| Packaging | `electron-builder` (signed NSIS installer) |
| Quality | Vitest, Playwright, ESLint, Prettier, Husky + lint-staged, GitHub Actions CI |

**Project layout**
```
ayyaz-pharmacy/
  electron/
    main/            app start, window, security setup
    ipc/             IPC router: validation + role checks
    db/              schema, migrations, repositories
    services/        sales, inventory, import, backup, print, fbr (optional)
  src/               React UI
    app/             shell, routing, theme
    features/        pos, items, inventory, import, returns, reports, settings
    components/ui/   shared design-system components
  shared/
    domain/          pure business rules: money, GST, units, FEFO, cash close
    ipc/             Zod contracts + generated types
  tests/             integration + e2e
```

---

## 9. Release plan

| Phase | Timeline | Scope |
|---|---|---|
| **Phase 0: Foundation** | Week 1 | Project setup on latest versions, security hardening, CI, design system, database schema, login and roles, settings, backup |
| **Phase 1: MVP** | Weeks 2–7 | Item master with price/GST choice, **CSV/Excel import**, batches and opening stock, POS + 80mm receipt, returns, expiry and low-stock alerts, basic reports → **go live at the counter** |
| **Phase 2** | Weeks 8–11 | Purchases, suppliers and ledger, expenses, cash close, full reports, exports |
| **Phase 3 (optional)** | Later | FBR POS integration, customer credit (udhaar), Urdu receipts, DRAP controlled-drug register, owner mobile view |

Questions will be asked at each phase whenever a business rule or design choice isn't clear, rather than guessing.

---

## 10. Success metrics
- Average time to bill a customer is under 30 seconds.
- The full medicine list is imported in a single session.
- No expired items are sold.
- At the monthly stock count, stock differs from the system by less than 1%.
- A cash close is done and its difference recorded every day.
- No data is ever lost, and no security incidents occur.

---

## 11. Open questions
1. **Printer model:** which brand/model of 80mm printer, so the paper cutter, cash drawer kick and logo printing can be tested.
2. **Cash drawer:** is a cash drawer connected to the printer, and should it open automatically when a cash bill is paid?
3. **Existing spreadsheet:** if a medicine list already exists in Excel, please share a sample (a few rows are enough) so the column mapping can be tuned to it.

**Resolved**
- "Sale price only" means the price already includes GST; the receipt shows the GST part worked out of it (§3.2).
- Encryption of the database and backups is on, with a recovery key (§6.2).
