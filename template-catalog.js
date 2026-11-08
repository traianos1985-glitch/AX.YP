export function mergeTemplateOverrides(publishedTemplates, localTemplates) {
  const published = Array.isArray(publishedTemplates) ? publishedTemplates : [];
  const local = Array.isArray(localTemplates) ? localTemplates : [];
  const localById = new Map();
  const localWithoutId = [];
  local.forEach((template) => {
    if (!template || typeof template !== 'object') return;
    if (template.id === undefined || template.id === null || template.id === '') {
      localWithoutId.push(template);
      return;
    }
    localById.set(String(template.id), template);
  });
  const overriddenIds = new Set(localById.keys());
  return [
    ...published.filter((template) => !template || template.id === undefined || template.id === null || !overriddenIds.has(String(template.id))),
    ...localById.values(),
    ...localWithoutId
  ];
}
