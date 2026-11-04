import { Container } from "@/components/layout/container";
import { StudentCabinet } from "@/components/dashboard/student-cabinet";

export default function StudentDashboardPage() {
  return (
    <Container className="py-6 sm:py-14">
      <StudentCabinet />
    </Container>
  );
}
