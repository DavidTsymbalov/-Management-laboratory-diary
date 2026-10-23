import { Container } from "@/components/layout/container";
import { StudentLogin } from "@/components/dashboard/student-login";

export default function StudentLoginPage() {
  return (
    <Container className="py-10 sm:py-14">
      <StudentLogin />
    </Container>
  );
}
