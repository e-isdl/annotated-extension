export const ANNOTATION_TYPES = ['Reaction', 'Fact check', 'Explainer', 'Hot take', 'Question'];

export const ANNOTATION_LIMITS = {
  Reaction: 280,
  'Fact check': 500,
  Explainer: 600,
  'Hot take': 800,
  Question: 1000,
};

export function annotationLimitFor(type) {
  return ANNOTATION_LIMITS[type] ?? 1000;
}
