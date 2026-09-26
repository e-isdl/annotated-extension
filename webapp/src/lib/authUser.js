import { supabase } from './supabase';

let cachedUser;
let inflight = null;

export function getCurrentUser() {
  if (cachedUser !== undefined) return Promise.resolve(cachedUser);
  if (inflight) return inflight;
  const request = loadCurrentUser();
  inflight = request;
  const release = () => { if (inflight === request) inflight = null; };
  request.then(release, release);
  return request;
}

async function loadCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    cachedUser = session?.user || null;
  } catch {
    return null;
  }
  return cachedUser;
}

supabase.auth.onAuthStateChange((_event, session) => {
  cachedUser = session?.user || null;
});
