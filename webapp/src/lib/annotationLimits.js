export const ANNOTATION_TYPES = ['Reaction', 'Fact check', 'Explainer', 'Hot take', 'Question'];

// Flat 1000-character limit for every annotation type, matching the database
// (update_annotation, create_extension_post, create_annotated_post).
export const ANNOTATION_LIMITS = {
  Reaction: 1000,
  'Fact check': 1000,
  Explainer: 1000,
  'Hot take': 1000,
  Question: 1000,
};

export function annotationLimitFor() {
  return 1000;
}
