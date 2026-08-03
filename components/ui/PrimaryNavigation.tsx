"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavigationItem = { label: string; href: string; exact?: boolean };
const current = (pathname: string, item: NavigationItem) => item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
function NavigationLinks({ items, onNavigate, mobileTasks = false }: { items: NavigationItem[]; onNavigate?: () => void; mobileTasks?: boolean }) {
  const pathname = usePathname();
  return <ul className={mobileTasks ? "grid grid-cols-4 gap-1" : "flex flex-col gap-1 md:flex-row md:flex-wrap"}>{items.map(item => { const active = current(pathname, item); return <li key={item.href} className={mobileTasks ? "min-w-0" : undefined}><Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`inline-flex min-h-control w-full items-center justify-center rounded-md px-2 py-2 text-center text-label transition-colors duration-fast md:w-auto md:px-3 ${active ? "bg-brand-subtle text-brand underline decoration-2 underline-offset-4" : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"}`}>{item.label}{active && <span className="sr-only">, current page</span>}</Link></li>; })}</ul>;
}
export default function PrimaryNavigation({ label, items, persistentMobile = false }: { label: string; items: NavigationItem[]; persistentMobile?: boolean }) {
  return <nav aria-label={label} className={persistentMobile ? "contents md:block" : undefined}><div className="hidden md:block"><NavigationLinks items={items} /></div>{persistentMobile ? <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-line bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-md md:hidden"><NavigationLinks items={items} mobileTasks /></div> : <details className="group relative md:hidden"><summary className="inline-flex min-h-control cursor-pointer list-none items-center rounded-md border border-line-strong bg-surface px-3 text-label text-ink marker:content-none">Menu <span aria-hidden="true" className="ml-2 group-open:rotate-180">⌄</span></summary><div className="absolute right-0 z-dropdown mt-2 min-w-64 rounded-lg border border-line bg-surface p-2 shadow-md"><NavigationLinks items={items} /></div></details>}</nav>;
}
