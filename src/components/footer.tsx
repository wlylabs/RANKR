import { Logo } from "@/components/logo";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
        <Logo size={22} className="opacity-80" />
        <p className="text-[12.5px] text-foreground-subtle">
          Demo mode — payments are simulated, no real charges occur.
        </p>
      </div>
    </footer>
  );
}
