import SamplePeople from './SamplePeople';

// People to follow side section (sample people with pfps).
export default function PeopleToFollow({ limit = 10 }) {
  return (
    <section aria-label="People to follow">
      <div className="flex items-center justify-between mb-2">
        <p className="sidebar-label mb-0">People to follow</p>
      </div>
      <div className="flex flex-col gap-1">
        <SamplePeople limit={limit} />
      </div>
    </section>
  );
}
