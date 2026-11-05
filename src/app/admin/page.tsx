import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { AuthForm } from "@/components/dashboard/auth-form";

export const metadata: Metadata = { title: "Вход администратора" };

export default function AdminLoginPage() {
  return <Container><AuthForm role="admin" /></Container>;
}
