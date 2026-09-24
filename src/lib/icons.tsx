// Icon set — verbatim ports of the legacy thin-line monochrome SVGs plus the
// CDN-hosted bank/card/merchant logo maps (ACC_ICONS / MERCH_ICONS).

import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const IC: Record<string, ReactNode> = {
  home: (
    <Svg><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /></Svg>
  ),
  list: (
    <Svg><path d="M4 6.5h16" /><path d="M4 12h16" /><path d="M4 17.5h16" /></Svg>
  ),
  plus: (
    <Svg><path d="M12 5v14M5 12h14" /></Svg>
  ),
  target: (
    <Svg><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.6" /><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" /></Svg>
  ),
  wallet: (
    <Svg><rect x="3" y="6" width="18" height="12.5" rx="3" /><path d="M3 10h18" /><circle cx="16" cy="14.8" r="1.1" /></Svg>
  ),
  gear: (
    <Svg><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M18 6l-1.4 1.4M7.4 16.6 6 18" /></Svg>
  ),
  right: (
    <Svg><path d="M9.5 6l6 6-6 6" /></Svg>
  ),
  left: (
    <Svg><path d="M14.5 6l-6 6 6 6" /></Svg>
  ),
  x: (
    <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>
  ),
  check: (
    <Svg><path d="M5 13l4 4L19 7" /></Svg>
  ),
  del: (
    <Svg><path d="M21 5.5V18.5H8.5L4 12l4.5-6.5H21z" /><path d="M12 9.5l5 5M17 9.5l-5 5" /></Svg>
  ),
  search: (
    <Svg><circle cx="11" cy="11" r="6.2" /><path d="M20 20l-4.6-4.6" /></Svg>
  ),
  refresh: (
    <Svg><path d="M20 11.5a8 8 0 1 0-2.2 5.6" /><path d="M20.5 4.5v7h-7" /></Svg>
  ),
  star: (
    <Svg><path d="M12 4l1.9 4.5 4.9.5-3.7 3.3 1.1 4.8L12 14.8l-4.2 2.3 1.1-4.8-3.7-3.3 4.9-.5z" /></Svg>
  ),
  dots: (
    <Svg><circle cx="5.5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18.5" cy="12" r="1.4" /></Svg>
  ),
  trash: (
    <Svg><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></Svg>
  ),
  pen: (
    <Svg><path d="M4.5 19.5l.9-4 10.6-10.6 3 3L8.4 18.6z" /><path d="M14 6l3 3" /></Svg>
  ),
  link: (
    <Svg><path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6" /><path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5l-2.7 2.7a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6" /></Svg>
  ),
  empty: (
    <Svg><path d="M4 5h16v14H4z" /><path d="M4 10h16M9 15h6" /></Svg>
  ),
  shield: (
    <Svg><path d="M12 3l7 2.5v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9v-5z" /><path d="M9 12l2 2 4-4" /></Svg>
  ),
  note: (
    <Svg><path d="M5 3.5h14v17l-3.5-2.5L12 20.5l-3.5-2.5L5 20.5z" /></Svg>
  ),
  open: (
    <Svg><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 13.5V19H5.5V6.5H11" /></Svg>
  ),
  share: (
    <Svg><path d="M12 15V4" /><path d="M8 7.5 12 3.5l4 4" /><path d="M6 12v6.5h12V12" /></Svg>
  ),
  pie: (
    <Svg><path d="M12 3a9 9 0 1 0 9 9h-9z" /><circle cx="12" cy="12" r="9" /></Svg>
  ),
  bars: (
    <Svg><path d="M5 20v-7M10 20V5M15 20v-9M20 20V9" /></Svg>
  ),
  bank: (
    <Svg><path d="M3 9.5 12 5l9 4.5" /><path d="M3 20h18" /><path d="M5 20v-9M9.5 20v-9M12 20v-9M14.5 20v-9M19 20v-9" /></Svg>
  ),
  mic: (
    <Svg><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" /><path d="M12 17v3.5" /></Svg>
  ),
  chev: (
    <Svg><path d="M6 9l6 6 6-6" /></Svg>
  ),
  cal: (
    <Svg><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M8 3.5v3M16 3.5v3M3 9.5h18" /></Svg>
  ),
  trend: (
    <Svg><path d="M3 17l6-6 4 3 8-8" /><path d="M14 6h7v7" /></Svg>
  ),
  downcir: (
    <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7.5v9M8.4 15.6 12 19.2l3.6-3.6" /></Svg>
  ),
  plusB: (
    <Svg><path d="M12 5v14M5 12h14" /></Svg>
  ),
  cart: (
    <Svg><path d="M4 7.5h16l-1.4 8.2a1.5 1.5 0 0 1-1.5 1.3H6.9a1.5 1.5 0 0 1-1.5-1.3z" /><path d="M8.5 7.5 12 3.5l3.5 4" /><path d="M10 11v3.5M14 11v3.5" /></Svg>
  ),
};

export interface LogoRec {
  name: string;
  g: string;
  src: string;
  alt?: string;
}

/* bank / card logos for accounts (CDN-hosted SVGs) */
export const ACC_ICONS: Record<string, LogoRec> = {
  axis: { name: "Axis Bank", g: "Banks", src: "https://cdn.jsdelivr.net/gh/praveenpuglia/indian-banks@main/assets/logos/utib/symbol.svg" },
  sbi: { name: "State Bank of India", g: "Banks", alt: "SBI", src: "https://cdn.jsdelivr.net/gh/praveenpuglia/indian-banks@main/assets/logos/sbin/symbol.svg" },
  hdfc: { name: "HDFC Bank", g: "Banks", alt: "HDFC", src: "https://cdn.jsdelivr.net/gh/praveenpuglia/indian-banks@main/assets/logos/hdfc/symbol.svg" },
  icici: { name: "ICICI Bank", g: "Banks", alt: "ICICI", src: "https://cdn.jsdelivr.net/gh/praveenpuglia/indian-banks@main/assets/logos/icic/symbol.svg" },
  kotak: { name: "Kotak Mahindra", g: "Banks", alt: "Kotak", src: "https://cdn.jsdelivr.net/gh/praveenpuglia/indian-banks@main/assets/logos/kkbk/symbol.svg" },
  pnb: { name: "Punjab National Bank", g: "Banks", alt: "PNB", src: "https://cdn.jsdelivr.net/gh/praveenpuglia/indian-banks@main/assets/logos/punb/symbol.svg" },
  idfc: { name: "IDFC First Bank", g: "Banks", alt: "IDFC", src: "https://cdn.jsdelivr.net/gh/praveenpuglia/indian-banks@main/assets/logos/idfb/symbol.svg" },
  hsbc: { name: "HSBC", g: "Banks", alt: "HSBC", src: "https://cdn.simpleicons.org/hsbc" },
  visa: { name: "Visa", g: "Cards", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Visa_Inc._logo.svg" },
  mastercard: { name: "Mastercard", g: "Cards", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Mastercard_logo.svg" },
  rupay: { name: "RuPay", g: "Cards", alt: "RuPay", src: "https://commons.wikimedia.org/wiki/Special:FilePath/RuPay.svg" },
  pluxee: { name: "Pluxee", g: "Cards", alt: "Pluxee", src: "https://upload.wikimedia.org/wikipedia/commons/6/65/Pluxee_Logo_2023.svg" },
};

/* merchant logos for the merchant portal (CDN-hosted SVGs, same pattern) */
export const MERCH_ICONS: Record<string, LogoRec> = {
  zomato: { name: "Zomato", g: "Food & Delivery", src: "https://cdn.simpleicons.org/zomato/ED6A45" },
  swiggy: { name: "Swiggy", g: "Food & Delivery", src: "https://cdn.simpleicons.org/swiggy/FC8019" },
  kfc: { name: "KFC", g: "Food & Delivery", src: "https://cdn.simpleicons.org/kfc/F40027" },
  mcd: { name: "McDonald's", g: "Food & Delivery", src: "https://cdn.simpleicons.org/mcdonalds/FBC216" },
  starb: { name: "Starbucks", g: "Food & Delivery", src: "https://cdn.simpleicons.org/starbucks/00704A" },
  bbask: { name: "BigBasket", g: "Groceries", src: "https://cdn.simpleicons.org/bigbasket/2CA01C" },
  uber: { name: "Uber", g: "Ride & Travel", src: "https://cdn.simpleicons.org/uber" },
  ppe: { name: "PhonePe", g: "Payments & UPI", src: "https://cdn.simpleicons.org/phonepe/5F259F" },
  gpay: { name: "Google Pay", g: "Payments & UPI", src: "https://cdn.simpleicons.org/googlepay/4285F4" },
  patm: { name: "Paytm", g: "Payments & UPI", src: "https://cdn.simpleicons.org/paytm/002D70" },
  airtel: { name: "Airtel", g: "Bills & Services", src: "https://cdn.simpleicons.org/airtel/E40000" },
  jio: { name: "Jio", g: "Bills & Services", src: "https://cdn.simpleicons.org/jio/0A288A" },
  netflix: { name: "Netflix", g: "Bills & Services", src: "https://cdn.simpleicons.org/netflix/E50914" },
  spotfy: { name: "Spotify", g: "Bills & Services", src: "https://cdn.simpleicons.org/spotify/1DB954" },
};
