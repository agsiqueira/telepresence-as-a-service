import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <section aria-labelledby="sign-in-heading" className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-participant flex-col items-center px-4 py-12 sm:px-6">
      <div className="mb-8 max-w-prose text-center"><p className="text-label uppercase tracking-wide text-brand">Welcome back</p><h1 id="sign-in-heading" className="mt-2 text-heading-1">Sign in to Unfar</h1><p className="mt-3 text-body text-ink-secondary">Continue to your authorized Explorer, Teleporter, or operational context.</p></div>
      <SignIn />
    </section>
  );
}
