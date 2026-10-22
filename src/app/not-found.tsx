import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <Container className="py-16">
      <EmptyState
        title="Страница не найдена"
        description="Такого адреса пока нет. Вернитесь на главную и продолжите знакомство с Management Laboratory."
        action={
          <Button href="/" variant="secondary">
            На главную
          </Button>
        }
      />
    </Container>
  );
}
