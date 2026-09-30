import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { createProjectSchema, projectIdSchema, updateStageSchema } from "@/lib/validation/projects";
import { projectRepository } from "./repository";
import { syncRecommendedStage } from "./recommendation";

export function projectService(client: PrismaClient) {
  const repository = projectRepository(client);
  return {
    list: repository.list,
    get: async (id: string) => {
      const projectId = projectIdSchema.parse(id);
      await syncRecommendedStage(client, projectId);
      return repository.find(projectId);
    },
    create: (input: unknown) => repository.create(createProjectSchema.parse(input)),
    setStage: (id: string, input: unknown) => repository.setStage(projectIdSchema.parse(id), updateStageSchema.parse(input).currentStage),
  };
}
