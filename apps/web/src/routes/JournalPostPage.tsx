import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CommentDto, CreateCommentRequest, JournalPostDto, UpdateCommentRequest } from "@kidcom/shared";

import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { MediaDetailGallery } from "../components/MediaDetailGallery";
import { apiGet, apiPost, apiPatch, apiDelete, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

// A small curated set rather than a full emoji library/CDN picker — keeps
// this self-contained and fast, and covers what a family-journal comment
// actually needs.
const EMOJI_OPTIONS = [
  "😀", "😂", "🥰", "😊", "😍", "🥳", "😢", "😮",
  "👍", "👏", "🙌", "🙏", "💪", "👀", "🎉", "🔥",
  "❤️", "💕", "⭐", "✅", "👶", "🍼", "🏆", "😴",
];

// Comment thread for a single journal post — kept separate from the feed
// (per the chunk 5 plan) so JournalPage stays a lightweight scroll.
//
// The post itself is always fetched here (GET /children/:childId/journal/
// :postId) rather than relying on it being carried over as router
// navigation state from wherever the link came from. It used to rely on
// that state, which broke silently on a page reload, a direct/deep link, or
// any link that simply forgot to pass it (the dashboard's "Latest Journal
// Entry" card did exactly that) — the page would show only the comment
// thread with no post content above it, which read as "linked to the wrong
// place." Router state (if present, e.g. from JournalPostCard's Link) is
// still used as an instant first paint while the real fetch is in flight,
// so navigating from the feed still feels immediate.
export function JournalPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const childId = searchParams.get("childId");
  const [post, setPost] = useState<JournalPostDto | undefined>(
    () => (location.state as { post?: JournalPostDto } | null)?.post
  );
  const [postError, setPostError] = useState<string | null>(null);

  const [comments, setComments] = useState<CommentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);

  useHeaderConfig(
    {
      title: "Comments",
      rightAction: post && user && post.authorId === user.id ? (
        <button
          onClick={handleDeletePost}
          disabled={deletingPost}
          aria-label="Delete post"
          className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors disabled:opacity-60"
        >
          <Icon name="delete" />
        </button>
      ) : undefined,
    },
    [post, user, deletingPost]
  );

  useEffect(() => {
    if (!childId || !postId) {
      setLoading(false);
      return;
    }
    apiGet<{ items: CommentDto[] }>(`/children/${childId}/journal/${postId}/comments`)
      .then((res) => setComments(res.items))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Couldn't load comments"))
      .finally(() => setLoading(false));
  }, [childId, postId]);

  useEffect(() => {
    if (!childId || !postId) return;
    let cancelled = false;
    apiGet<JournalPostDto>(`/children/${childId}/journal/${postId}`)
      .then((res) => {
        if (!cancelled) setPost(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setPostError(err instanceof ApiRequestError ? err.message : "Couldn't load this post");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [childId, postId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!childId || !postId || !text.trim()) return;
    setSending(true);
    try {
      const comment = await apiPost<CommentDto>(`/children/${childId}/journal/${postId}/comments`, {
        text,
      } satisfies CreateCommentRequest);
      setComments((prev) => [...prev, comment]);
      setText("");
    } catch {
      setError("Couldn't post that comment — try again.");
    } finally {
      setSending(false);
    }
  }

  function insertEmoji(emoji: string) {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  }

  function startEdit(comment: CommentDto) {
    setEditingId(comment.id);
    setEditText(comment.text);
  }

  async function handleSaveEdit(commentId: string) {
    if (!childId || !postId || !editText.trim()) return;
    setBusyCommentId(commentId);
    try {
      const updated = await apiPatch<CommentDto>(
        `/children/${childId}/journal/${postId}/comments/${commentId}`,
        { text: editText } satisfies UpdateCommentRequest
      );
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingId(null);
    } catch {
      setError("Couldn't save that edit — try again.");
    } finally {
      setBusyCommentId(null);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!childId || !postId) return;
    if (!window.confirm("Delete this comment?")) return;
    setBusyCommentId(commentId);
    try {
      await apiDelete<void>(`/children/${childId}/journal/${postId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      setError("Couldn't delete that comment — try again.");
    } finally {
      setBusyCommentId(null);
    }
  }

  async function handleDeletePost() {
    if (!childId || !postId) return;
    if (!window.confirm("Delete this journal post? This can't be undone.")) return;
    setDeletingPost(true);
    try {
      await apiDelete<void>(`/children/${childId}/journal/${postId}`);
      navigate("/journal", { replace: true });
    } catch {
      setDeletingPost(false);
      window.alert("Couldn't delete that post — try again.");
    }
  }

  if (!childId) {
    return (
      <section className="px-container-padding pt-6">
        <p className="font-body-md text-body-md text-error">Missing child context for this post.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-screen">
      <div className="flex-1 px-container-padding flex flex-col gap-3 pb-32">
        {postError && !post && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {postError}
          </p>
        )}
        {post && (
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col gap-4 mb-2">
            <div className="flex items-center gap-3">
              <Avatar name={post.authorName} avatarAssetId={post.authorAvatarUrl} kind="adult" size="md" />
              <div className="min-w-0">
                <h2 className="font-label-md text-label-md text-on-surface line-clamp-1">
                  {post.title}
                </h2>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  {post.authorName} • {new Date(post.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <MediaDetailGallery media={post.media} alt={post.title} />
            <p className="font-body-md text-body-md text-text-main whitespace-pre-wrap">{post.text}</p>
          </div>
        )}
        {loading && <p className="font-body-md text-body-md text-on-surface-variant">Loading…</p>}
        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}
        {!loading && comments.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">
            No comments yet — be the first.
          </p>
        )}
        {comments.map((c) => {
          const isMine = user && c.authorId === user.id;
          const isEditing = editingId === c.id;
          const busy = busyCommentId === c.id;
          return (
            <div key={c.id} className="bg-surface-container-lowest rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Avatar name={c.authorName} avatarAssetId={c.authorAvatarUrl} kind="adult" size="xs" />
                  <span className="font-label-md text-label-md text-on-surface">{c.authorName}</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {isMine && !isEditing && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(c)}
                      disabled={busy}
                      aria-label="Edit comment"
                      className="w-7 h-7 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors disabled:opacity-60"
                    >
                      <Icon name="edit" className="text-base" />
                    </button>
                    <button
                      onClick={() => handleDeleteComment(c.id)}
                      disabled={busy}
                      aria-label="Delete comment"
                      className="w-7 h-7 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors disabled:opacity-60"
                    >
                      <Icon name="delete" className="text-base" />
                    </button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full bg-surface-container rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="font-label-sm text-label-sm text-on-surface-variant px-3 py-1"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveEdit(c.id)}
                      disabled={busy || !editText.trim()}
                      className="font-label-sm text-label-sm text-primary px-3 py-1 disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="font-body-md text-body-md text-text-main">{c.text}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* bottom-20 (not bottom-0) + z-40 (below BottomNav's z-50) — this used
          to sit at bottom-0 with no z-index, which put it directly *behind*
          the app's persistent bottom nav (also fixed to the bottom of the
          screen): the input was there in the DOM but visually hidden under
          the nav bar, reading as "no input for a comment." bottom-20/z-40 is
          the same pattern MessageComposePage already uses correctly for a
          bar that has to float above the nav instead of at the true bottom
          of the viewport. */}
      <div className="fixed bottom-20 inset-x-0 z-40 bg-surface border-t border-surface-variant/50">
        {showEmojiPicker && (
          <div className="grid grid-cols-8 gap-1 px-container-padding pt-3 max-w-md mx-auto">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="text-2xl leading-none py-1.5 rounded-lg hover:bg-surface-container-lowest transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="p-container-padding pb-safe flex items-center gap-2">
          <Avatar name={user ? `${user.firstName} ${user.lastName}` : "You"} avatarAssetId={user?.avatarUrl} kind="adult" size="sm" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment…"
            className="flex-1 bg-surface-container-lowest rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md"
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker((v) => !v)}
            aria-label="Insert emoji"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0 ${
              showEmojiPicker ? "text-primary" : "text-on-surface-variant hover:text-primary"
            }`}
          >
            <Icon name="mood" className="text-xl" />
          </button>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center disabled:opacity-60 shrink-0"
          >
            <Icon name="send" className="text-[20px]" />
          </button>
        </form>
      </div>
    </div>
  );
}
