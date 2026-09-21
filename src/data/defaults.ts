// Seed data + default document — verbatim ports of DEF_CATS / DEF_ACCS /
// DEF_MERCHS / MERCH_POOL / defaultDoc from the legacy file.

import type { Account, Category, Doc, Merchant } from "../types";

export const DEF_CATS: Category[] = [
  { id: "cat-hom", name: "Housing", kind: "expense", color: "#B98DA8", emoji: "🏠" },
  { id: "cat-fd", name: "Food", kind: "expense", color: "#C98A5E", emoji: "🍽️" },
  { id: "cat-gro", name: "Groceries", kind: "expense", color: "#7C9AA6", emoji: "🛒" },
  { id: "cat-utl", name: "Utilities", kind: "expense", color: "#8FA6C9", emoji: "💡" },
  { id: "cat-tra", name: "Transportation", kind: "expense", color: "#A68A7C", emoji: "🚗" },
  { id: "cat-shp", name: "Shopping", kind: "expense", color: "#C99A7C", emoji: "🛍️" },
  { id: "cat-cth", name: "Clothes", kind: "expense", color: "#A68393", emoji: "👕" },
  { id: "cat-gout", name: "Going out", kind: "expense", color: "#C98B8B", emoji: "🍻" },
  { id: "cat-ent", name: "Entertainment", kind: "expense", color: "#9B8CA6", emoji: "🍿" },
  { id: "cat-sub", name: "Subscription", kind: "expense", color: "#8CA6A3", emoji: "📅" },
  { id: "cat-ext", name: "Extras", kind: "expense", color: "#777B7E", emoji: "🤷🏻‍♂️" },
  { id: "cat-sav", name: "Savings", kind: "expense", color: "#5BB98C", emoji: "🎯" },
  { id: "cat-sal", name: "Salary", kind: "income", color: "#5BB98C", emoji: "💼" },
  { id: "cat-oi", name: "Other income", kind: "income", color: "#777B7E", emoji: "💰" },
];

export const DEF_ACCS: Account[] = [
  { id: "acc-cash", name: "Cash", kind: "cash", opening: 0, color: "#7C9AA6" },
  { id: "acc-card", name: "Card", kind: "card", opening: 0, color: "#8CA683" },
];

export const DEF_MERCHS: Merchant[] = [
  { id: "mer-zomato", name: "Zomato", icon: "zomato", color: "#ED6A45" },
  { id: "mer-swiggy", name: "Swiggy", icon: "swiggy", color: "#FC8019" },
  { id: "mer-blinkit", name: "Blinkit", color: "#C7A71C" },
  { id: "mer-bigbasket", name: "BigBasket", icon: "bbask", color: "#2CA01C" },
  { id: "mer-uber", name: "Uber", icon: "uber", color: "#0B0B0C" },
  { id: "mer-ola", name: "Ola", color: "#A4C400" },
  { id: "mer-amazon", name: "Amazon", color: "#FF9900" },
  { id: "mer-flipkart", name: "Flipkart", color: "#2874F0" },
  { id: "mer-phonepe", name: "PhonePe", icon: "ppe", color: "#5F259F" },
  { id: "mer-gpay", name: "Google Pay", icon: "gpay", color: "#4285F4" },
  { id: "mer-paytm", name: "Paytm", icon: "patm", color: "#002D70" },
  { id: "mer-kirana", name: "Kirana / UPI", color: "#0071C5" },
];

/* Shared merchant pool — bundled with each deploy so every user sees the same
   branded merchants. Merged into the user list on boot (see migrate.ts). */
export const MERCH_POOL: Array<Partial<Merchant> & { name: string }> = [
  { name: "Zomato", icon: "zomato", color: "#ED6A45" },
  { name: "Swiggy", icon: "swiggy", color: "#FC8019" },
  { name: "BigBasket", icon: "bbask", color: "#2CA01C" },
  { name: "Uber", icon: "uber", color: "#0B0B0C" },
  { name: "PhonePe", icon: "ppe", color: "#5F259F" },
  { name: "Google Pay", icon: "gpay", color: "#4285F4" },
  { name: "Paytm", icon: "patm", color: "#002D70" },
  { name: "McDonald's", icon: "mcd", color: "#FBC216" },
  { name: "KFC", icon: "kfc", color: "#F40027" },
  { name: "Starbucks", icon: "starb", color: "#00704A" },
  { name: "Netflix", icon: "netflix", color: "#E50914" },
  { name: "Spotify", icon: "spotfy", color: "#1DB954" },
  { name: "Airtel", icon: "airtel", color: "#E40000" },
  { name: "Jio", icon: "jio", color: "#0A288A" },
  { name: "Blinkit", iconUrl: "https://cdn.brandfetch.io/idqFC5Rk0D/theme/dark/logo.svg?c=1bxid64Mup7aczewSAYMX&t=1700856650602", color: "#C7A71C" },
  { name: "Amazon", iconUrl: "https://cdn.brandfetch.io/idawOgYOsG/theme/dark/logo.svg?c=1bxid64Mup7aczewSAYMX&t=1747149760488", color: "#FF9900" },
  { name: "Ola", color: "#A4C400" },
  { name: "Flipkart", color: "#2874F0" },
  { name: "Merchant UPI", iconUrl: "https://www.vectorlogo.zone/logos/upi/upi-icon.svg", color: "#0071C5" },
  { name: "District", iconUrl: "https://b.zmtcdn.com/data/o2_assets/97b2cc0514896aee1292f2a4b96212291770448620.png", color: "#7C9AA6" },
  { name: "Net Banking", iconUrl: "https://cdn-icons-png.flaticon.com/128/1652/1652007.png", color: "#7C9AA6" },
  { name: "Zepto", iconUrl: "https://cdn.iconscout.com/icon/free/png-512/free-zepto-icon-svg-download-png-12158609.png?f=webp&w=512", color: "#7C9AA6" },
  { name: "Ratnadeep", iconUrl: "https://cdn.brandfetch.io/idW213JOfJ/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1781748589386", color: "#A68A7C" },
  { name: "DMart", iconUrl: "https://cdn.brandfetch.io/idbIaGXY_H/theme/dark/logo.svg?c=1bxid64Mup7aczewSAYMX&t=1668076332427", color: "#7C9AA6" },
  { name: "Indian Oil", iconUrl: "https://cdn.brandfetch.io/idG17-gn3R/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1668078179236", color: "#7C9AA6" },
  { name: "Youtube", iconUrl: "https://cdn.brandfetch.io/idVfYwcuQz/theme/dark/logo.svg?c=1bxid64Mup7aczewSAYMX&t=1728452987792", color: "#7C9AA6" },
  { name: "Kirana / UPI", color: "#0071C5" },
];

export function defaultDoc(): Doc {
  return {
    schemaVersion: 2,
    meta: { createdAt: new Date().toISOString() },
    settings: {
      currency: "INR",
      monthStartDay: 1,
      weekStartsOn: 1,
      hideBalances: false,
      highlightNoMerchant: true,
      lastDate: null,
      lastCategoryId: null,
      lastMerchantId: "",
      gist: null,
      deviceName: "My device",
      friends: [],
      catV: 2,
      goalV: 1,
      merchV: 2,
    },
    categories: JSON.parse(JSON.stringify(DEF_CATS)) as Category[],
    accounts: JSON.parse(JSON.stringify(DEF_ACCS)) as Account[],
    merchants: JSON.parse(JSON.stringify(DEF_MERCHS)) as Merchant[],
    transactions: [],
    goals: [],
    budgets: [],
    shortcuts: [],
    groceryLists: [],
  };
}
