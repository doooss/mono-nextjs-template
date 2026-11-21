import { Button } from '@repo/ui/components/button';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 sm:p-20">
      <h1 className="text-3xl font-bold">Template</h1>
      <p className="text-neutral-600">프리텐다드</p>
      <Button>Get started</Button>
    </main>
  );
}
