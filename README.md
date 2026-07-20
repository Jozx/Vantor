# Vantor

Personal finance tracker for Paraguay. Tracks bank accounts, broker accounts, mutual funds, credit card debt, and investments across PYG and USD currencies.

Built with **React + TypeScript + Vite** and deployed as a native Android app via **Capacitor**.

## Features

- **Multi-currency tracking** — PYG and USD with per-currency net worth breakdown
- **Credit card debt** — charges, payments, and available credit tracking; subtracted from net worth
- **Accounts** — bank, broker, mutual fund, and credit card accounts with opening balances
- **Investments** — buy/sell securities with average-cost tracking, cash balance integrity, and unrealized P/L
- **Cash ledger** — deposits, withdrawals, income, expenses, and interest accruals with tag budgets
- **Quick transaction** — FAB-based quick-add: spent, received, pay card, or move money in two taps
- **Market data** — live stock quotes via Finnhub API with cached prices for offline use
- **Dashboard** — assets, liabilities, net worth history chart, and account summaries
- **Cash flow Sankey** — income vs. expense flows by tag as an interactive Sankey diagram
- **Reports** — monthly statements per account type with per-account breakdowns
- **Transaction history** — filterable, sortable, editable, and deletable transaction list
- **Dark/light mode** — system-aware theme, persisted to settings
- **CSV export/import** — full database backup as zipped CSVs, importable on any platform
- **Responsive UI** — mobile bottom tabs + desktop sidebar, TailwindCSS with shadcn/ui
- **Data-at-rest encryption** — SQLCipher on Android via Keystore-backed secret storage

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** TailwindCSS v4, shadcn/ui (base-ui primitives)
- **Database:** @capacitor-community/sqlite with SQLCipher encryption (Android), jeep-sqlite (browser)
- **Mobile:** Capacitor 8 (Android)
- **Charts:** Recharts (line charts, Sankey diagrams)
- **API:** Finnhub (stock quotes), exchangerate.host (FX rates)
- **Export:** PapaParse (CSV), fflate (zip)
- **Testing:** Vitest

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Android Studio](https://developer.android.com/studio) (for Android build)
- [Java 17+](https://adoptium.net/)

### Development

```bash
npm install
npm run dev
```

### Build & Run on Android

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

Install on a connected device:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Tests

```bash
npm test
```

## Project Structure

```
src/
├── components/
│   ├── layout/            # Layout shell: Header, Sidebar, DesktopSidebar, BottomTabs
│   ├── ui/                # shadcn/ui primitives (Select, Button, etc.)
│   ├── AmountInput.tsx
│   ├── QuickTransaction.tsx  # FAB-triggered quick-add modal
│   ├── TagSelector.tsx       # Tag picker with inline custom-tag creation
│   └── ThemeProvider.tsx
├── db/                    # SQLite database layer
│   ├── migrate.ts         # Schema & migrations
│   ├── repos/             # Typed repositories (Account, CashLedger, SecurityLedger, Holding, MarketData, Settings, etc.)
│   └── types.ts           # TypeScript interfaces
├── lib/
│   └── utils.ts           # Shared utilities (cn, formatters, account type config)
├── pages/
│   ├── Home.tsx           # Dashboard with net worth chart
│   ├── Accounts.tsx       # Account list (filtered by type)
│   ├── AccountDetails.tsx # Account detail, trade/ledger forms
│   ├── Transactions.tsx   # Global filterable transaction list
│   ├── CashFlow.tsx       # Sankey diagram + period selector
│   ├── Reports.tsx        # Monthly statements per account type
│   ├── Settings.tsx       # API keys, currency, theme
│   └── Health.tsx         # DB health check
├── services/
│   ├── financeService.ts      # Net worth, buy/sell, transfers, credit card ops
│   ├── marketService.ts       # Finnhub + FX rate API
│   ├── netWorthService.ts     # Net worth history snapshots
│   └── importExportService.ts # CSV/ZIP export and import
├── App.tsx                # Router & layout wrapper
└── index.css              # Tailwind imports & base styles
```

## License

Private — all rights reserved.
