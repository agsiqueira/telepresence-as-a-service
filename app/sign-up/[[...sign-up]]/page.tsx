import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main aria-labelledby="sign-up-heading" className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-participant flex-col items-center px-4 py-12 sm:px-6">
      <div className="mb-8 max-w-prose text-center"><p className="text-label uppercase tracking-wide text-brand">Begin exploring</p><h1 id="sign-up-heading" className="mt-2 text-heading-1">Create your Unfar account</h1><p className="mt-3 text-body text-ink-secondary">Create a secure sign-in identity to access the Unfar pilot.</p></div>
      <SignUp />
    </main>
  );
}
