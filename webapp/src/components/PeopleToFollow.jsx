import SamplePeople from './SamplePeople';

// People to follow side card on Explore (sample people with pfps).
export default function PeopleToFollow({ limit = 10 }) {
  return (
    <section className="explore-people" aria-label="People to follow">
      <h2 className="explore-people-title">People to follow</h2>
      <p className="explore-people-sub">Loud builders, worth reading.</p>
      <SamplePeople limit={limit} size="sm" />
    </section>
  );
}
