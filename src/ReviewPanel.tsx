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
import { reviewView, type ReviewFilter } from "./review-view";

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
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [author, setAuthor] = useState("本机用户");
    const [body, setBody] = useState("");
    const [anchor, setAnchor] = useState<ReviewAnchor | null>(null);
    const [replyId, setReplyId] = useState("");
    const [reply, setReply] = useState("");
    const [filter, setFilter] = useState<ReviewFilter>("pending");
    const pending = Boolean(body.trim() || reply.trim() || busy);
    const busyRef = useRef(false);
    const loadingRef = useRef(true);
    const loadSequence = useRef(0);
    const saveSequence = useRef(0);
    const context = useRef({ documentId: record.id, versionId });
    context.current = { documentId: record.id, versionId };
    const mounted = useRef(false);
    const bodyInput = useRef<HTMLTextAreaElement>(null);
    const replyInput = useRef<HTMLTextAreaElement>(null);
    const focusRequested = useRef(false);
    useEffect(() => {
      onDirty(pending);
    }, [pending, onDirty]);
    const reload = async () => {
      if (busyRef.current) return;
      const sequence = ++loadSequence.current;
      const documentId = record.id;
      loadingRef.current = true;
      setLoading(true);
      setReady(false);
      await loadReview(documentId)
        .then((result) => {
          if (mounted.current && sequence === loadSequence.current) {
            setReview(result);
            setReady(true);
            setError("");
          }
        })
        .catch((e) => {
          if (mounted.current && sequence === loadSequence.current)
            setError(e instanceof Error ? e.message : "批注读取失败。");
        })
        .finally(() => {
          if (mounted.current && sequence === loadSequence.current) {
            loadingRef.current = false;
            setLoading(false);
          }
        });
    };
    useEffect(() => {
      mounted.current = true;
      saveSequence.current++;
      busyRef.current = false;
      setBusy(false);
      setReview({ id: record.id, revision: 0, threads: [] });
      setError("");
      void reload();
      return () => {
        mounted.current = false;
        loadSequence.current++;
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
        // A failed initial/reload read must keep its retry action reachable.
        if (ready) setError("");
        focusRequested.current = true;
      },
    }));
    useEffect(() => {
      if (anchor && !loading && !busy && focusRequested.current) {
        bodyInput.current?.focus();
        focusRequested.current = false;
      }
    }, [anchor, loading, busy]);
    useEffect(() => {
      if (replyId) replyInput.current?.focus();
    }, [replyId]);
    useEffect(() => {
      setAnchor(null);
      setBody("");
      setReply("");
      setReplyId("");
      setFilter("pending");
      focusRequested.current = false;
    }, [record.id, versionId]);
    const persist = async (next: ReviewRecord, success?: () => void) => {
      if (busyRef.current || loadingRef.current || !ready) return;
      const sequence = ++saveSequence.current;
      const savedContext = { documentId: record.id, versionId };
      busyRef.current = true;
      setBusy(true);
      setError("");
      try {
        await saveReview(next, review.revision);
        if (!mounted.current || sequence !== saveSequence.current || context.current.documentId !== savedContext.documentId) return;
        setReview(next);
        if (context.current.versionId === savedContext.versionId) success?.();
      } catch (e) {
        if (mounted.current && sequence === saveSequence.current && context.current.documentId === savedContext.documentId)
          setError(e instanceof Error ? e.message : "批注保存失败。");
      } finally {
        if (sequence === saveSequence.current) {
          busyRef.current = false;
          if (mounted.current) setBusy(false);
        }
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
    const view = reviewView(review.threads, versionId, filter, reply.trim() ? replyId : "");
    return (
      <section className="review-panel" aria-label="本机批注">
        <header className="review-heading">
          <h2>批注</h2>
          <span className="review-status" role="status">{busy ? "保存中…" : "仅本机"}</span>
        </header>
        {version && <p className="review-version">{version.label}</p>}
        <details className="review-details">
          <summary>审阅设置</summary>
          <p>批注绑定当前保存版本，仅存于本机。旧版意见请在“版本”中回看。</p>
          <p>显示名由自己填写，不代表已验证身份；尚未云端共享。</p>
          <label>
            显示名
            <input value={author} maxLength={60} disabled={busy} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <p>点击文字或拖出矩形选择位置。聚焦文字后按 Enter 批注，Shift+Enter 框选。</p>
        </details>
        {error && (
          <div role="alert" className="error">
            {error}
            <button
              disabled={busy || loading}
              onClick={() => void reload()}
            >
              {loading ? "读取中…" : "重新载入"}
            </button>
            <small>未发送的内容会保留。</small>
          </div>
        )}
        {version ? (
          <>
            <div className={`anchor-summary ${anchor ? "selected" : ""}`}>
              {anchor?.kind === "text" ? (
                <blockquote>{anchor.quote.slice(0, 250)}</blockquote>
              ) : anchor?.kind === "region" ? (
                "已框选区域"
              ) : (
                "点击文字或框选区域，留下意见"
              )}
            </div>
            {anchor && <>
            <label>
              <textarea
                ref={bodyInput}
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
              disabled={!anchor || !body.trim() || !ready || loading || busy}
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
              {busy ? "保存中…" : "添加批注"}
            </button>
            <button className="review-cancel" disabled={busy} onClick={() => {
              if (body.trim() && !window.confirm("放弃当前未保存批注？")) return;
              setBody("");
              setAnchor(null);
            }}>取消</button>
            </>}
          </>
        ) : (
          <p>切换到“审阅”，在已保存版本上留下意见。</p>
        )}
        <div className="review-filter" role="group" aria-label="筛选批注">
          <button aria-pressed={filter === "pending"} onClick={() => setFilter("pending")}>待处理 {view.pending}</button>
          <button aria-pressed={filter === "resolved"} onClick={() => setFilter("resolved")}>已解决 {view.resolved}</button>
        </div>
        {loading ? (
          <p>正在读取批注…</p>
        ) : view.visible.length === 0 ? (
          <p className="review-empty">{filter === "pending" ? "暂无待处理批注" : "暂无已解决批注"}</p>
        ) : null}
        {view.visible
          .map((thread) => (
            <article
              className={`review-thread ${thread.resolved ? "resolved" : ""}`}
              key={thread.id}
            >
              <button
                className="anchor-link"
                aria-label={thread.anchor.kind === "text" ? `定位批注：${thread.anchor.quote.slice(0, 60)}` : "定位框选区域"}
                disabled={!version || busy || loading}
                onClick={() => onLocate(thread.anchor)}
              >
                {thread.anchor.kind === "text"
                  ? `“${thread.anchor.quote.slice(0, 60)}” ↗`
                  : "框选区域 ↗"}
              </button>
              {thread.messages.map((item) => (
                <div className="review-message" key={item.id}>
                  <strong>{item.author}</strong>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </time>
                  <p>{item.body}</p>
                </div>
              ))}
              <div className="review-actions">
                <button
                  disabled={!ready || busy || loading}
                  onClick={() =>
                    act(() => updateThread(review, thread.id, !thread.resolved))
                  }
                >
                  {thread.resolved ? "重新打开" : "解决"}
                </button>
                <button
                  disabled={busy || loading}
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
                    <textarea
                      ref={replyInput}
                      aria-label="回复内容"
                      value={reply}
                      maxLength={5000}
                      disabled={busy}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="回复这条意见…"
                    />
                  </label>
                  <button
                      disabled={!reply.trim() || !ready || busy || loading}
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
                    回复
                  </button>
                  <button className="review-cancel" disabled={busy} onClick={() => {
                    if (reply.trim() && !window.confirm("放弃当前未保存回复？")) return;
                    setReply("");
                    setReplyId("");
                  }}>取消</button>
                </div>
              )}
            </article>
          ))}
      </section>
    );
  },
);
