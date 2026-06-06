import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80).optional(),
  password: z.string().min(10)
});

export async function POST(request: Request) {
  const body = registerSchema.parse(await request.json());
  const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });

  if (existing) {
    return NextResponse.json({ error: "Email already registered." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash: await hashPassword(body.password)
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true
    }
  });

  await setSessionCookie({
    userId: user.id,
    email: user.email,
    role: user.role
  });

  return NextResponse.json({ user });
}
