import { Container } from "@/components/layout/container";
import { TeacherLogin } from "@/components/dashboard/teacher-login";

export default function TeacherLoginPage() {
  return (
    <Container className="py-12 sm:py-16">
      <TeacherLogin />
    </Container>
  );
}
