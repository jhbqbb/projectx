import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <div>
      <AuthForm mode="login" />
      <div className="-mt-20 text-center text-sm text-muted-foreground">
        Need an account?{" "}
        <Link href="/register" className="text-cyan-200 hover:underline">
          Register
        </Link>
      </div>
    </div>
  );
}
