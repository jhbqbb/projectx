import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";

export default function RegisterPage() {
  return (
    <div>
      <AuthForm mode="register" />
      <div className="-mt-20 text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link href="/login" className="text-cyan-200 hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
