"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "km" | "en";

const dict = {
  km: {
    brand: "TopUpHub", search: "ស្វែងរកផលិតផល...", all: "ទាំងអស់", buy: "ទិញឥឡូវ", login: "ចូលគណនី", register: "បង្កើតគណនី", logout: "ចាកចេញ",
    email: "អ៊ីមែល", password: "ពាក្យសម្ងាត់", name: "ឈ្មោះ", myOrders: "ការបញ្ជាទិញរបស់ខ្ញុំ", reseller: "ដៃគូលក់ត្រួត", admin: "អ្នកគ្រប់គ្រង",
    playerId: "Player ID / លេខទូរស័ព្ទ", serverId: "Server ID", quantity: "ចំនួន", total: "សរុប", payNow: "បង់ប្រាក់ជាមួយ PayWay",
    loginToBuy: "សូមចូលគណនីដើម្បីទិញ", loading: "កំពុងផ្ទុក...", noProducts: "មិនមានផលិតផល", redirecting: "កំពុងបញ្ជូនទៅ PayWay...",
    continuePay: "បន្តទៅ PayWay", simulate: "ក្លែងធ្វើការបង់ប្រាក់ជោគជ័យ (សាកល្បង)", status: "ស្ថានភាព", order: "ការបញ្ជាទិញ", amount: "ចំនួនទឹកប្រាក់",
    PENDING_PAYMENT: "រង់ចាំការបង់ប្រាក់", PAID: "បានបង់ប្រាក់", PROCESSING: "កំពុងដំណើរការ", COMPLETED: "ជោគជ័យ", FAILED: "បរាជ័យ", REFUNDED: "បានសងប្រាក់វិញ",
    payHint: "ស្កែន QR ឬបង់តាម ABA PAY នៅទំព័រ PayWay បន្ទាប់មកត្រឡប់មកទីនេះ។", cancelled: "ការបង់ប្រាក់ត្រូវបានបោះបង់",
    noOrders: "មិនទាន់មានការបញ្ជាទិញ", date: "កាលបរិច្ឆេទ", save: "រក្សាទុក", copy: "ចម្លង", balance: "សមតុល្យ", topup: "បញ្ចូលលុយ",
  },
  en: {
    brand: "TopUpHub", search: "Search products...", all: "All", buy: "Buy now", login: "Log in", register: "Sign up", logout: "Log out",
    email: "Email", password: "Password", name: "Name", myOrders: "My orders", reseller: "Reseller", admin: "Admin",
    playerId: "Player ID / phone number", serverId: "Server ID", quantity: "Quantity", total: "Total", payNow: "Pay with PayWay",
    loginToBuy: "Log in to buy", loading: "Loading...", noProducts: "No products", redirecting: "Redirecting to PayWay...",
    continuePay: "Continue to PayWay", simulate: "Simulate successful payment (test)", status: "Status", order: "Order", amount: "Amount",
    PENDING_PAYMENT: "Waiting for payment", PAID: "Paid", PROCESSING: "Processing", COMPLETED: "Completed", FAILED: "Failed", REFUNDED: "Refunded",
    payHint: "Scan the QR or pay with ABA PAY on the PayWay page, then come back here.", cancelled: "Payment was cancelled",
    noOrders: "No orders yet", date: "Date", save: "Save", copy: "Copy", balance: "Balance", topup: "Top up",
  },
} as const;

type Key = keyof (typeof dict)["en"];
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key | string) => string }>({ lang: "km", setLang: () => {}, t: (k) => String(k) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("km");
  useEffect(() => {
    const saved = localStorage.getItem("th_lang");
    if (saved === "km" || saved === "en") setLangState(saved);
  }, []);
  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem("th_lang", l); };
  const t = (k: string) => (dict[lang] as Record<string, string>)[k] ?? (dict.en as Record<string, string>)[k] ?? k;
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
