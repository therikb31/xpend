// Domain types — ported from the b63 single-doc model (ARCHITECTURE.md + defaultDoc).

export type TxnDir = "expense" | "income";

export interface TxnBase {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // integer paise
  note?: string;
  name?: string;
  createdAt: number;
}

export interface ExpenseTxn extends TxnBase {
  dir: TxnDir;
  categoryId: string;
  accountId: string;
  merchantId?: string;
}

export interface TransferTxn extends TxnBase {
  dir: "trans";
  from: string; // account id or "__prev"
  to: string; // account id or "__prev"
}

export type Txn = ExpenseTxn | TransferTxn;

export type AccountKind = "cash" | "card" | "bank" | "other" | "savings";

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  opening: number; // paise
  prev?: number; // savings: previous-savings bucket (paise)
  cur?: number; // legacy, removed by migrateSav
  color: string;
  icon?: string | null;
  secondary?: boolean;
  archived?: boolean;
}

export type CategoryKind = "expense" | "income";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  emoji?: string;
  custom?: boolean;
}

export interface Merchant {
  id: string;
  name: string;
  icon?: string | null; // preset key into MERCH_ICONS
  iconUrl?: string | null; // custom logo URL
  color: string;
  logoScale?: number; // 50..150
  createdAt?: number;
  fromPool?: boolean;
}

export interface Budget {
  id: string;
  name: string;
  categoryIds: string[];
  limit: number; // paise
  period: "monthly" | "weekly";
  mkey: string; // YYYY-MM
  createdAt?: number;
}

export interface GoalSource {
  id: string;
  name: string;
  type: string;
  amount: number; // paise
  date?: string | null;
}

export interface Goal {
  id: string;
  name: string;
  target: number; // paise
  current?: number; // legacy (replaced by sources)
  plan?: number; // paise/month
  date: string; // YYYY-MM or ""
  sources: GoalSource[];
  completed: boolean;
  completedAt?: string | null;
  actualAmount?: number | null;
  actualDate?: string | null;
  actualTxId?: string | null;
  actualCatId?: string | null;
  createdAt?: number;
}

export interface Shortcut {
  id: string;
  name: string;
  dir: TxnDir;
  amount: string; // raw keypad string (as stored by legacy short-save)
  categoryId: string;
  accountId: string;
  merchantId?: string;
}

export interface GistCfg {
  gistId: string | null;
  salt: string;
  patCipher: { iv: string; ct: string };
  dirty: boolean;
  lastPushedAt?: string;
}

export interface Settings {
  currency: "INR";
  monthStartDay: number;
  weekStartsOn: number;
  hideBalances: boolean;
  highlightNoMerchant?: boolean;
  lastDate: string | null;
  lastCategoryId: string | null;
  lastMerchantId: string;
  gist: GistCfg | null;
  merchHidden?: string[];
  merchPoolV?: number;
  merchV?: number;
  catV?: number;
  goalV?: number;
  savV?: number;
}

export interface Doc {
  schemaVersion: 1;
  meta: { createdAt: string; updatedAt?: string };
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  merchants: Merchant[];
  transactions: Txn[];
  budgets: Budget[];
  goals: Goal[];
  shortcuts: Shortcut[];
}

// --- UI state (ports of App.view/prevView/mkey/flt/add/tr) ---

export type View =
  | "overview"
  | "activity"
  | "summary"
  | "budget"
  | "category"
  | "merchant"
  | "goals"
  | "analytics"
  | "accounts"
  | "settings"
  | "add";

export interface Filters {
  q: string;
  dir: "all" | TxnDir;
  cat: string; // category id or "all"
  acc: string; // account id or "all"
  merch: string; // merchant id, "__none", or "all"
}

export interface AddDraft {
  amount: string; // raw keypad string — must stay a string
  dir: TxnDir;
  categoryId: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  note: string;
  merchantId: string; // "" = none
}

export interface TransferDraft {
  from: string;
  to: string;
  amount: string;
  note: string;
}
