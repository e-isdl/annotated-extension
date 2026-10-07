// Buddy guide tips: { [id]: { title, body } }. Single source of copy.
// Titles 4 words max, bodies 15 words max. No emoji. If a line stops being
// true about its control, change the COPY here (never the feature).
const TIPS = {
  // HEADER
  search: { title: 'Search', body: 'Look for posts and sources.' },
  'theme-button': { title: 'Themes', body: 'Pick a look. Light, dark, or one of five bold themes.' },
  explore: { title: 'Explore', body: 'Browse communities and posts beyond your feed.' },
  leaderboard: { title: 'Leaderboard', body: 'See who is adding the most context.' },
  'tour-toggle': { title: 'Your guide', body: 'I explain whatever you point at. Click to mute me.' },
  create: { title: 'Create', body: 'Post a source with your own take on it.' },
  notifications: { title: 'Notifications', body: 'Replies and activity on your posts.' },
  avatar: { title: 'Your account', body: 'Profile, posts, and settings.' },
  // LEFT NAV
  'nav-home': { title: 'Home', body: 'Your main feed.' },
  'nav-top': { title: 'Top', body: 'The highest-voted posts.' },
  'nav-new': { title: 'New', body: 'Newest posts first.' },
  'nav-saved': { title: 'Saved', body: 'Posts you bookmarked for later.' },
  'nav-drafts': { title: 'Drafts', body: 'Unfinished posts waiting for you.' },
  communities: { title: 'Communities', body: 'Topic spaces where related posts live.' },
  'add-community': { title: 'Add a community', body: 'Add one to your list.' },
  // FEED
  'feed-sort': { title: 'Sort your feed', body: 'Best, Hot, New, or Top. Pick how you browse.' },
  'post-kind-chip': { title: 'Source type', body: 'Where the source comes from: article, X post, video, or podcast.' },
  'post-source': { title: 'The source', body: 'Where this came from. Open it to read the original.' },
  'post-quote': { title: 'The exact part', body: 'The passage the author is pointing at.' },
  'post-clip': { title: 'The clip', body: 'Plays just the part the author picked, not the whole thing.' },
  'post-vote': { title: 'Vote', body: 'Upvote posts that add real context.' },
  'post-comments': { title: 'Comments', body: 'Join the discussion on this post.' },
  'post-share': { title: 'Share', body: 'Send this post to someone.' },
  'post-save': { title: 'Save', body: 'Keep it in Saved for later.' },
  // POST PAGE
  'post-annotation': { title: 'The take', body: "The author's point of view on the source." },
  'comment-box': { title: 'Your comment', body: 'Join the conversation. You will need to sign in.' },
  // RIGHT RAIL
  'communities-explore': { title: 'Communities to explore', body: 'Find topics worth following.' },
  'get-extension': { title: 'The extension', body: 'Annotated is a Chrome sidebar extension first. Download it here.' },
  // CREATE PAGE
  'create-type': { title: 'Post type', body: 'Source: link plus your take. Text: just an idea. Moment: a YouTube timestamp.' },
  'create-community': { title: 'Community', body: 'Choose where this lives. Optional.' },
  'create-note-kind': { title: 'Kind of note', body: 'Reaction, fact check, explainer, hot take, or question. Sets expectations.' },
  'create-source-url': { title: 'Source link', body: 'Paste the page or video you are responding to.' },
  'create-source-title': { title: 'Source title', body: 'Name it so people know what they are opening.' },
  'create-exact-part': { title: 'The exact part', body: 'Quote or point to what people should look at.' },
  'create-annotation': { title: 'Your take', body: 'What should people understand, question, or add? This is the heart of the post.' },
  'create-preview': { title: 'Live preview', body: 'See your post as it will look before you publish.' },
};

export const GREETING = {
  title: 'Hi!',
  body: "Annotated lets you add your take to an exact part of a source. Point at anything and I'll explain it. Try the themes button!",
};

export const ASLEEP_BODY = 'I am asleep. Click to wake me.';

export default TIPS;
