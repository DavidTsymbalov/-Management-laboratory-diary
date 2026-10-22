import { Container } from "@/components/layout/container";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t-2 border-border/10 py-8">
      <Container className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium text-foreground">Management Laboratory</p>
        <p>A school team project for gamified classroom progress.</p>
      </Container>
    </footer>
  );
}
