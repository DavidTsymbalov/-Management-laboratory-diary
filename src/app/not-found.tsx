import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <Container className="py-16">
      <EmptyState
        title="Page not found"
        description="That route doesn’t exist yet. Head back home to explore Management Laboratory."
        action={
          <Button href="/" variant="secondary">
            Back to home
          </Button>
        }
      />
    </Container>
  );
}
