// Loads the embedded image-vision skill definition shipped in assets/SKILL.md.
// The runtime skill keeps the image-vision entry visible in the DSH skill
// catalog (and the GUI `/image-vision` slash menu) with a DSH-oriented body.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SKILL_PATH = fileURLToPath(new URL("../assets/SKILL.md", import.meta.url));

/** Strip YAML frontmatter and read `name` / `description` from it. */
function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { name: undefined, description: undefined, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { name: undefined, description: undefined, body: raw };
  const front = raw.slice(3, end);
  const read = (key) => {
    const match = front.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return match ? match[1].trim() : undefined;
  };
  return {
    name: read("name"),
    description: read("description"),
    body: raw.slice(end + 4).trimStart(),
  };
}

/** @returns {{ name, description, content }} for ctx.skills.register(...). */
export function loadSkillDefinition() {
  const raw = readFileSync(SKILL_PATH, "utf8");
  const { name, description, body } = parseFrontmatter(raw);
  if (!name || !description) {
    throw new Error(`dsh-image-vision: assets/SKILL.md is missing name or description frontmatter`);
  }
  return { name, description, content: body };
}
