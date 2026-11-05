import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { TeacherPanel } from "@/components/dashboard/teacher-panel";

export const metadata: Metadata = { title: "Кабинет администратора" };

export default function AdminDashboardPage() {
  return <Container><TeacherPanel role="admin" /></Container>;
}
