"use client";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container className="py-16">
      <ErrorState
        title="We hit a snag"
        description={
          error.message ||
          "Something unexpected happened while loading this page."
        }
        action={
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        }
      />
    </Container>
  );
}
