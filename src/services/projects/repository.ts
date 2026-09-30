import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ProjectStage } from "@/domain/stages/stages";

export function projectRepository(client: PrismaClient) {
  return {
    list: () => client.project.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      include: { _count: { select: { stories: { where: { archivedAt: null } } } } },
    }),
    find: (id: string) => client.project.findUnique({
      where: { id },
      include: { _count: { select: { stories: { where: { archivedAt: null } } } } },
    }),
    create: (data: { name: string; description: string }) => client.project.create({ data }),
    setStage: (id: string, currentStage: ProjectStage) => client.project.update({ where: { id }, data: { currentStage } }),
  };
}
