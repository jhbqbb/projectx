import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "research_auth";

type SessionPayload = {
  userId: string;
  email: string;
  role: string;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET ?? "development-secret-change-me-32-bytes";
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionFromRequest(request?: NextRequest) {
  const token = request
    ? request.cookies.get(COOKIE_NAME)?.value
    : (await cookies()).get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, getJwtSecret());
    return verified.payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(request?: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session?.userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true
    }
  });
}

export async function requireCurrentUser(request?: NextRequest) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  return user;
}
