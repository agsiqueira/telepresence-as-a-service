import type { Metadata } from "next";
import { ClerkProvider, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "VirtualTrip",
  description:
    "Telepresence-as-a-service — phone-to-phone livestreamed visits.",
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
          <header className="bg-spartan-green text-white px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold text-lg">
              VirtualTrip
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <SignedIn>
                <Link href="/viewer">Request a visit</Link>
                <Link href="/operator">Go online</Link>
                <UserButton />
              </SignedIn>
              <SignedOut>
                <Link href="/sign-in">Sign in</Link>
              </SignedOut>
            </nav>
          </header>
          <main className="min-h-screen">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
