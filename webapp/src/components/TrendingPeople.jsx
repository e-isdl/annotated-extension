import SamplePeople from './SamplePeople';

// Sidebar rows of well-known people until live annotators fill in.
export default function TrendingPeople({ limit = 3, exclude = null }) {
  return <SamplePeople limit={limit} exclude={exclude} />;
}
