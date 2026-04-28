import type { AtlasEntity } from '@agent-atlas/schema';

export function renderEntityCard(entity: AtlasEntity): string {
  const relations = entity.relations?.length
    ? entity.relations.map((relation) => `- ${relation.type} -> \`${relation.target}\``).join('\n')
    : '- No relations declared.';

  return `# ${entity.title}\n\nID: \`${entity.id}\`\n\n${entity.summary}\n\n## Relations\n\n${relations}\n`;
}
