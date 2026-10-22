"use client";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container className="py-16">
      <ErrorState
        title="Что-то пошло не так"
        description="Не удалось загрузить страницу. Попробуйте ещё раз или вернитесь на главную."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={reset}>
              Повторить
            </Button>
            <Button href="/" variant="secondary">
              На главную
            </Button>
          </div>
        }
      />
    </Container>
  );
}
