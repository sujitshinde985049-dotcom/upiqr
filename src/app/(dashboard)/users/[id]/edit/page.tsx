import { notFound } from "next/navigation";
import {
  canAccessUsersPage,
  requireAuthenticatedUser,
} from "@/lib/auth/authorization";
import {
  getManagedUserForActor,
  UserServiceError,
} from "@/lib/services/user-service";
import { UserEditPageContent } from "./user-edit-content";

interface UserEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function UserEditPage({ params }: UserEditPageProps) {
  const actor = await requireAuthenticatedUser();

  if (!canAccessUsersPage(actor)) {
    notFound();
  }

  const { id } = await params;

  let user;
  try {
    user = await getManagedUserForActor(actor, id);
  } catch (error) {
    if (error instanceof UserServiceError) {
      notFound();
    }
    throw error;
  }

  return <UserEditPageContent user={user} />;
}
