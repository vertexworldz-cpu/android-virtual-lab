import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-10 flex justify-center"><Logo size={28} /></div>
        {children}
        <p className="mt-10 text-center text-xs text-muted">Your AI. Your Control.</p>
      </div>
    </div>
  );
}
