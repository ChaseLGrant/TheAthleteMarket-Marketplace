import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "./tokens";

export const ADMIN_COOKIE = "tam_admin";

export async function isAdmin(): Promise<boolean> {
  return verifyAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);
}

/** Call at the top of EVERY admin page and server action. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
