import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Source-only material locations. Runtime assets keep their application layout.
export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export const presentationRoot = resolve(projectRoot, "../项目介绍");
export const competitionRoot = resolve(presentationRoot, "03-比赛材料");
export const demoMaterialsRoot = resolve(presentationRoot, "测试文件");
