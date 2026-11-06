import { Container } from "@/components/layout/container";
import { TeacherPanel } from "@/components/dashboard/teacher-panel";
export default function AdministratorDashboard() {
  return (
    <Container className="py-6 sm:py-14">
      <TeacherPanel role="admin" />
    </Container>
  );
}
