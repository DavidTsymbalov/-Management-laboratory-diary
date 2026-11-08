import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { EnrollmentForm } from "@/components/enrollment/enrollment-form";
import "@/components/enrollment/enrollment.css";

export const metadata: Metadata = {
  title: "Запись в класс",
  robots: { index: false, follow: false },
};

export default function EnrollmentPage() {
  return <Container className="py-6 sm:py-14"><EnrollmentForm /></Container>;
}
