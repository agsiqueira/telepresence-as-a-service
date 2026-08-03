import type { Metadata } from "next";
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import AccessStateSynchronizer from "@/components/AccessStateSynchronizer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Unfar", template: "%s · Unfar" },
  description: "Meaningful places and personal perspective, brought within reach through live, human-guided Journeys.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <a className="unfar-skip-link" href="#main-content">Skip to main content</a>
          <SignedIn><AccessStateSynchronizer /></SignedIn>
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex min-h-16 max-w-operational items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="text-heading-3 text-brand">
              Unfar
            </Link>
            <nav aria-label="Account" className="flex min-h-control items-center gap-4 text-body-sm">
              <SignedIn>
                <UserButton />
              </SignedIn>
              <SignedOut>
                <Link className="inline-flex min-h-control items-center text-link underline underline-offset-4" href="/sign-in">Sign in</Link>
              </SignedOut>
            </nav>
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="min-h-[calc(100dvh-4rem)]">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
