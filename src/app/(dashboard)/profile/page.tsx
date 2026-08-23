import { requireAuthenticatedUser } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db/prisma";
import { mapUser } from "@/lib/mappers";
import { ProfilePageContent } from "./profile-content";

export default async function ProfilePage() {
  const actor = await requireAuthenticatedUser();
  const user = await prisma.user.findUnique({ where: { id: actor.id } });

  if (!user) {
    return null;
  }

  return <ProfilePageContent user={mapUser(user)} />;
}
