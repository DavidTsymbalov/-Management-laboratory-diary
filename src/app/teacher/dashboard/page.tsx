import { Container } from "@/components/layout/container";
import { TeacherPanel } from "@/components/dashboard/teacher-panel";

export default function TeacherDashboardPage() {
  return (
    <Container className="py-6 sm:py-14">
      <TeacherPanel />
    </Container>
  );
}
