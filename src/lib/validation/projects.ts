import { z } from "zod";
import { stages } from "@/domain/stages/stages";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Sisesta projekti nimi.").max(120, "Nimi võib olla kuni 120 märki."),
  description: z.string().trim().max(4000, "Kirjeldus võib olla kuni 4000 märki.").default(""),
}).strict();
export const updateStageSchema = z.object({ currentStage: z.enum(stages) }).strict();
export const projectIdSchema = z.string().min(1).max(100);
