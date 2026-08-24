import { redirect } from "next/navigation";
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth/safe-redirect";

export default function HomePage() {
  redirect(DEFAULT_POST_LOGIN_PATH);
}
