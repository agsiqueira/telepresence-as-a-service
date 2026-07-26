import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

export default function HomePage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-spartan-green mb-4">
        VirtualTrip
      </h1>
      <p className="text-gray-600 mb-10">
        A livestreamed visit to a real place, from a phone in someone&apos;s
        hand to yours.
      </p>

      <SignedOut>
        <SignInButton mode="modal">
          <button className="bg-spartan-green text-white px-6 py-3 rounded-md font-medium">
            Sign in to get started
          </button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/viewer"
            className="bg-spartan-green text-white px-6 py-3 rounded-md font-medium"
          >
            Request a visit
          </Link>
          <Link
            href="/operator"
            className="border border-spartan-green text-spartan-green px-6 py-3 rounded-md font-medium"
          >
            Go online as an operator
          </Link>
        </div>
      </SignedIn>
    </div>
  );
}
