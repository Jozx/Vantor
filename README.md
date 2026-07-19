# Vantor

Personal finance tracker for Paraguay. Tracks bank accounts, broker accounts, mutual funds, credit card debt, and investments across PYG and USD currencies.

Built with **React + TypeScript + Vite** and deployed as a native Android app via **Capacitor**.

## Features

- **Multi-currency tracking** — PYG and USD with per-currency net worth breakdown
- **Credit card debt** — subtracted from net worth, not treated as assets
- **Accounts** — bank, broker, and mutual fund accounts with opening balances
- **Investments** — buy/sell securities with FIFO lot tracking and unrealized P&L
- **Cash transactions** — deposits, withdrawals, and credit card charges with tag budgets
- **Market data** — live stock quotes via Finnhub API
- **Dashboard** — assets, liabilities, net worth, portfolio value, and cash flow summary
- **Dark/light mode** — system-aware theme
- **Data export** — JSON backup with encrypted SQLite storage
- **Mobile-first UI** — responsive TailwindCSS with bottom navigation

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** TailwindCSS v4
- **Database:** CapacitorCommunity SQLite (local, encrypted)
- **Mobile:** Capacitor 7 (Android)
- **API:** Finnhub (stock quotes)
- **Testing:** Vitest

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [Android Studio](https://developer.android.com/studio) (for Android build)
- [Java 17+](https://adoptium.net/)

### Development

```bash
pnpm install
pnpm dev
```

### Build & Run on Android

```bash
pnpm build
pnpm exec cap sync android
cd android
./gradlew assembleDebug
```

Install on a connected device:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Tests

```bash
pnpm test
```

## Project Structure

```
src/
├── components/        # Shared UI components
│   ├── AmountInput.tsx
│   ├── QuickTransaction.tsx
│   └── ThemeProvider.tsx
├── db/                # Database layer
│   ├── migrate.ts     # Schema & migrations
│   ├── repos/         # Data access (Account, CashLedger, SecurityLedger, Holding, Settings)
│   └── types.ts       # TypeScript interfaces
├── lib/
│   └── utils.ts       # Shared utilities (account type config, formatters)
├── pages/             # Route pages
│   ├── Home.tsx       # Dashboard
│   ├── Accounts.tsx   # Account list
│   ├── AccountDetails.tsx  # Account detail & forms
│   ├── Transactions.tsx
│   ├── CashFlow.tsx
│   ├── Health.tsx
│   └── Settings.tsx
├── services/          # Business logic
│   ├── financeService.ts     # Net worth, totals, buy/sell
│   ├── marketService.ts      # Finnhub API
│   └── importExportService.ts
├── __tests__/         # Vitest tests
├── App.tsx            # Router & layout
└── db.ts              # SQLite initialization
```

## License

Private — all rights reserved.
