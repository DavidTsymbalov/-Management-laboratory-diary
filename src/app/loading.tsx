import { Container } from "@/components/layout/container";
import { LoadingState } from "@/components/ui/loading-state";

export default function Loading() {
  return (
    <Container className="py-16">
      <LoadingState label="Loading Management Laboratory…" />
    </Container>
  );
}
