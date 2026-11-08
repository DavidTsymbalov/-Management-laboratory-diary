import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { EnrollmentInbox } from "@/components/enrollment/enrollment-inbox";
import "@/components/enrollment/enrollment.css";

export const metadata: Metadata = {
  title: "Заявки в класс",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function EnrollmentInboxPage() {
  return <Container className="py-6 sm:py-14"><EnrollmentInbox /></Container>;
}
