import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { loadReview, saveReview, type DocumentRecord } from "./store";
import {
  addThread,
  reviewMessage,
  updateThread,
  validateAnchor,
  type ReviewAnchor,
  type ReviewRecord,
} from "./review";

export type ReviewPanelHandle = {
  selectAnchor: (anchor: ReviewAnchor) => void;
};
type Props = {
  record: DocumentRecord;
  versionId: string;
  onDirty: (dirty: boolean) => void;
  onLocate: (anchor: ReviewAnchor) => void;
};
export const ReviewPanel = forwardRef<ReviewPanelHandle, Props>(
  function ReviewPanel({ record, versionId, onDirty, onLocate }, ref) {
    const [review, setReview] = useState<ReviewRecord>({
      id: record.id,
      revision: 0,
      threads: [],
    });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [author, setAuthor] = useState("本机用户");
    const [body, setBody] = useState("");
    const [anchor, setAnchor] = useState<ReviewAnchor | null>(null);
    const [replyId, setReplyId] = useState("");
    const [reply, setReply] = useState("");
    const [showResolved, setShowResolved] = useState(false);
    const pending = Boolean(body.trim() || reply.trim() || busy);
    const busyRef = useRef(false);
    useEffect(() => {
      onDirty(pending);
    }, [pending, onDirty]);
    useEffect(() => {
      let cancelled = false;
      void loadReview(record.id)
        .then((result) => {
          if (!cancelled) setReview(result);
        })
        .catch((e) => {
          if (!cancelled) setError(String(e.message));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [record.id]);
    useImperativeHandle(ref, () => ({
      selectAnchor(next) {
        if (busyRef.current) return;
        if (
          body.trim() &&
          !window.confirm("放弃正在填写的批注，选择新位置？")
        ) {
          if (anchor) onLocate(anchor);
          return;
        }
        setAnchor(next);
        setBody("");
        setError("");
      },
    }));
    useEffect(() => {
      setAnchor(null);
      setBody("");
      setReply("");
      setReplyId("");
    }, [versionId]);
    const persist = async (next: ReviewRecord, success?: () => void) => {
      if (busyRef.current || loading) return;
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        await saveReview(next, review.revision);
        setReview(next);
        success?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "批注保存失败。");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    };
    const act = (build: () => ReviewRecord, success?: () => void) => {
      try {
        void persist(build(), success);
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败。");
      }
    };
    const version = record.versions.find((v) => v.id === versionId);
    const threads = review.threads.filter((t) => t.versionId === versionId);
    return (
      <section className="review-panel" aria-label="本机批注">
        <h2>一起审阅，从留下意见开始</h2>
        <p className="review-notice">
          本机批注 · 尚未云端共享。显示名由自己填写，不代表已验证身份。
        </p>
        {error && (
          <div role="alert" className="error">
            {error}
            <button
              disabled={busy}
              onClick={() => {
                setLoading(true);
                void loadReview(record.id)
                  .then(setReview)
                  .then(() => setError(""))
                  .catch((e) => setError(e.message))
                  .finally(() => setLoading(false));
              }}
            >
              重新载入批注
            </button>
          </div>
        )}
        <label>
          我的显示名
          <input
            value={author}
            maxLength={60}
            disabled={busy}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </label>
        {version ? (
          <>
            <p>
              正在审阅：{version.label}
              。点击文字，或在页面拖出一个矩形；聚焦文字后 Enter
              添加文字批注，Shift+Enter 框住这段内容。
            </p>
            <div className="anchor-summary">
              {anchor?.kind === "text" ? (
                <blockquote>{anchor.quote.slice(0, 250)}</blockquote>
              ) : anchor?.kind === "region" ? (
                `已框选区域 · ${Math.round(anchor.width)} × ${Math.round(anchor.height)}，视口 ${anchor.viewportWidth}px`
              ) : (
                "先在页面选择批注位置"
              )}
            </div>
            <label>
              批注意见
              <textarea
                aria-label="批注意见"
                value={body}
                maxLength={5000}
                disabled={!anchor || busy || loading}
                onChange={(e) => setBody(e.target.value)}
                placeholder="这里需要怎样调整？"
              />
            </label>
            <button
              className="primary"
              disabled={!anchor || !body.trim() || loading || busy}
              onClick={() =>
                act(
                  () =>
                    addThread(
                      review,
                      versionId,
                      validateAnchor(anchor, version.source),
                      reviewMessage(author, body),
                    ),
                  () => {
                    setBody("");
                    setAnchor(null);
                  },
                )
              }
            >
              {busy ? "保存中…" : "保存批注到本机"}
            </button>
          </>
        ) : (
          <p>切换到“审阅”，在已保存版本上留下意见。</p>
        )}
        <div className="review-filter">
          <strong>待处理 {threads.filter((t) => !t.resolved).length}</strong>
          <label>
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />
            显示已解决
          </label>
        </div>
        {loading ? (
          <p>正在读取批注…</p>
        ) : threads.length === 0 ? (
          <p>这个版本还没有批注。旧版本的意见可在“版本”中回看。</p>
        ) : null}
        {threads
          .filter((t) => showResolved || !t.resolved)
          .map((thread) => (
            <article
              className={`review-thread ${thread.resolved ? "resolved" : ""}`}
              key={thread.id}
            >
              <button
                className="anchor-link"
                disabled={!version || busy}
                onClick={() => onLocate(thread.anchor)}
              >
                {thread.anchor.kind === "text"
                  ? `定位：“${thread.anchor.quote.slice(0, 60)}”`
                  : `定位框选区域（${thread.anchor.viewportWidth}px）`}
              </button>
              {thread.messages.map((item) => (
                <div className="review-message" key={item.id}>
                  <strong>{item.author}</strong>
                  <time>
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </time>
                  <p>{item.body}</p>
                </div>
              ))}
              <div className="review-actions">
                <button
                  disabled={busy || loading}
                  onClick={() =>
                    act(() => updateThread(review, thread.id, !thread.resolved))
                  }
                >
                  {thread.resolved ? "重新打开" : "标记已解决"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (replyId === thread.id) return;
                    if (reply.trim() && !window.confirm("放弃当前未保存回复？"))
                      return;
                    setReplyId(thread.id);
                    setReply("");
                  }}
                >
                  回复
                </button>
              </div>
              {replyId === thread.id && (
                <div>
                  <label>
                    回复内容
                    <textarea
                      aria-label="回复内容"
                      value={reply}
                      maxLength={5000}
                      disabled={busy}
                      onChange={(e) => setReply(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={!reply.trim() || busy || loading}
                    onClick={() =>
                      act(
                        () =>
                          updateThread(
                            review,
                            thread.id,
                            reviewMessage(author, reply),
                          ),
                        () => {
                          setReply("");
                          setReplyId("");
                        },
                      )
                    }
                  >
                    保存回复
                  </button>
                </div>
              )}
            </article>
          ))}
      </section>
    );
  },
);
