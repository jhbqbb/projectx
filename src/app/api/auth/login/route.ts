import { NextResponse } from "next/server";
import { z } from "zod";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = loginSchema.parse(await request.json());
  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() }
  });

  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role
  });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  });
}
