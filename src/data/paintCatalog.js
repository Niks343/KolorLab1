export const paintCategories = [
  { id: 'facade', label: 'Фасад' },
  { id: 'interior', label: 'Интерьер' },
  { id: 'plaster', label: 'Штукатурки' },
  { id: 'three-in-one', label: '3в1' },
  { id: 'primer', label: 'Грунты' },
  { id: 'impregnation', label: 'Пропитки' },
  { id: 'varnish', label: 'Лаки' },
  { id: 'enamel', label: 'Эмали' },
  { id: 'oil', label: 'Масла' },
];

export const paintApplications = [
  { id: 'facade', label: 'Фасад' },
  { id: 'interior', label: 'Интерьер' },
  { id: 'terrace', label: 'Терраса' },
  { id: 'bath', label: 'Баня' },
  { id: 'metal', label: 'Металл' },
];

export const paintMaterials = [
  { id: 'mineral', label: 'Минеральные поверхности' },
  { id: 'metal', label: 'Металл' },
  { id: 'plastic', label: 'Пластик' },
  { id: 'wood', label: 'Дерево' },
  { id: 'doors', label: 'Двери' },
  { id: 'windows', label: 'Окна' },
  { id: 'slopes', label: 'Откосы' },
];

const categoryByText = [
  ['plaster', /штукатур/i],
  ['three-in-one', /\b3\s*(?:в|-\s*)1\b|3в1/i],
  ['primer', /грунт/i],
  ['impregnation', /пропитк|антисептик/i],
  ['varnish', /лак\b|лаки/i],
  ['enamel', /эмал/i],
  ['oil', /масл/i],
  ['facade', /фасад/i],
];

export function getPaintProductMetadata(product) {
  const description = `${product.name ?? ''} ${product.finish ?? ''} ${product.purpose ?? ''}`;
  const inferredCategory = categoryByText.find(([, expression]) => expression.test(description))?.[0]
    ?? 'interior';
  const inferredApplications = [
    ...(product.surfaces?.includes('facade') || /фасад/i.test(description) ? ['facade'] : []),
    ...(product.surfaces?.some((surface) => ['wall', 'bath'].includes(surface)) || /интерьер|помещени/i.test(description) ? ['interior'] : []),
    ...(/террас/i.test(description) ? ['terrace'] : []),
    ...(product.surfaces?.includes('bath') || /баня|саун/i.test(description) ? ['bath'] : []),
    ...(/металл/i.test(description) ? ['metal'] : []),
  ];

  return {
    category: paintCategories.some(({ id }) => id === product.paintCategory) ? product.paintCategory : inferredCategory,
    applications: Array.isArray(product.applications)
      ? product.applications.filter((id) => paintApplications.some((item) => item.id === id))
      : inferredApplications,
    tintable: typeof product.tintable === 'boolean'
      ? product.tintable
      : product.tintBases?.length ? true : null,
    tintBases: product.tintable === false ? [] : (product.tintBases ?? []).filter((base) => base === 'A' || base === 'C'),
    compatibleMaterials: Array.isArray(product.compatibleMaterials)
      ? product.compatibleMaterials.filter((id) => paintMaterials.some((item) => item.id === id))
      : [],
  };
}
