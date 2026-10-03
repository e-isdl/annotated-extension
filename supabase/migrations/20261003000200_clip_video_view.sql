-- Expose recorded-clip columns through the public feed view.
-- The view was created before video_url / video_status existed, so ClipPage
-- (which reads clips_with_scores first) could never see uploaded recordings
-- and always fell back to the YouTube embed. Columns appended in place.

create or replace view public.clips_with_scores
with (security_invoker = true) as
 SELECT c.id,
    c.user_id,
    c.source_url,
    c.source_type,
    c.title,
    c.thumbnail,
    c.youtube_id,
    c.start_sec,
    c.end_sec,
    c.article_text,
    c.author,
    c.audio_url,
    c.slug,
    c.parent_clip_id,
    c.thread_position,
    c.created_at,
    c.transcript,
    c.community_id,
    c.annotation_type,
    c.source_domain,
    c.source_title,
    c.source_image_url,
    c.source_excerpt,
    COALESCE(v.score, 0) AS score,
    COALESCE(cm.comments_count, 0) AS comments_count,
    ((COALESCE(v.score, 0) + (COALESCE(cm.comments_count, 0) * 3)))::numeric AS best_score,
    (((COALESCE(v.score, 0) + (COALESCE(cm.comments_count, 0) * 2)))::numeric / power(((EXTRACT(epoch FROM (now() - c.created_at)) / 3600.0) + 2)::numeric, 1.4)) AS hot_score,
    c.duration,
    c.author_url,
    c.video_url,
    c.video_status
   FROM ((clips c
     LEFT JOIN clip_scores v ON ((v.clip_id = c.id)))
     LEFT JOIN ( SELECT comments.clip_id,
            (count(*))::integer AS comments_count
           FROM comments
          GROUP BY comments.clip_id) cm ON ((cm.clip_id = c.id)));
