"use client";
import {
  addTransitionType,
  startTransition,
  ViewTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  MessageCircle,
  Search,
  ShieldOff,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  blockEmojiPeer,
  loadEmojiThread,
  markEmojiRead,
  sendEmoji,
} from "@/lib/emoji-chat";
import {
  EMOJI_REACTIONS,
  mergeEmojiMessages,
  reactionName,
  type EmojiMessage,
  type EmojiPeer,
  type ReactionEmoji,
} from "@/lib/emoji-reactions";
import {
  playEmojiAudio,
  stopEmojiAudio,
  unlockEmojiAudio,
} from "@/lib/emoji-audio";
import { cloudError } from "@/lib/supabase";
import { useEmojiInbox } from "@/hooks/use-emoji-inbox";
import {
  EmojiBurst,
  type EmojiBurstEvent,
} from "@/components/social/emoji-burst";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
const time = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});
const date = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});
function narrowSnapshot() {
  return window.matchMedia("(max-width: 700px)").matches;
}
function narrowSubscribe(callback: () => void) {
  const media = window.matchMedia("(max-width: 700px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function serverNarrow() {
  return false;
}
function ChatAvatar({ peer, shared }: { peer: EmojiPeer; shared: boolean }) {
  return (
    <ViewTransition
      name={shared ? `chat-person-${peer.id}` : undefined}
      default="none"
      share="chat-avatar"
    >
      <span className="chat-avatar" aria-hidden="true">
        {peer.name
          .split(" ")
          .slice(0, 2)
          .map((part) => part[0])
          .join("")}
      </span>
    </ViewTransition>
  );
}
type Preferences = { sound: boolean; effects: boolean };
type PendingSend = {
  peer: string;
  emoji: ReactionEmoji;
  nonce: string;
  failed: boolean;
};
export function StudentChats({
  studentId,
  active,
  onOpen,
  onUnread,
}: {
  studentId: string;
  active: boolean;
  onOpen: () => void;
  onUnread: (count: number) => void;
}) {
  const narrow = useSyncExternalStore(
    narrowSubscribe,
    narrowSnapshot,
    serverNarrow,
  );
  const [preferences, setPreferences] = useState<Preferences>({
    sound: true,
    effects: true,
  });
  const [peerId, setPeerId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<Record<string, EmojiMessage[]>>({});
  const [loadingPeer, setLoadingPeer] = useState<string | null>(null);
  const [older, setOlder] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState<PendingSend | null>(null);
  const [sending, setSending] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [burst, setBurst] = useState<EmojiBurstEvent | null>(null);
  const [notice, setNotice] = useState<{
    peer: string;
    name: string;
    emoji: ReactionEmoji;
  } | null>(null);
  const [threadAttempt, setThreadAttempt] = useState(0);
  const [threadError, setThreadError] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const loadingOlder = useRef<{ top: number; height: number } | null>(null);
  const locked = useRef(false);
  const live = useRef(true);
  const currentPeer = useRef<string | null>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      stopEmojiAudio();
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const value = JSON.parse(
          localStorage.getItem("ml-emoji-preferences-v1") ?? "null",
        );
        if (
          value &&
          typeof value.sound === "boolean" &&
          typeof value.effects === "boolean"
        )
          setPreferences({ sound: value.sound, effects: value.effects });
      } catch {
        /* defaults work without storage */
      }
    }, 0);
    const unlock = () => unlockEmojiAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(null), 1400);
    return () => clearTimeout(timer);
  }, [burst]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  const react = useCallback(
    (emoji: ReactionEmoji, point?: { x: number; y: number }) => {
      if (document.hidden) return;
      if (preferences.sound) void playEmojiAudio(emoji);
      if (
        preferences.effects &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        setBurst({
          id: crypto.randomUUID(),
          emoji,
          x: point?.x ?? window.innerWidth / 2,
          y:
            point?.y ??
            Math.min(window.innerHeight - 100, window.innerHeight * 0.68),
        });
    },
    [preferences],
  );
  const incoming = useCallback(
    (messages: EmojiMessage[], peers: EmojiPeer[]) => {
      const allowed = messages.filter(
        (message) =>
          !peers.find((peer) => peer.id === message.sender_id)?.blocked,
      );
      setThreads((current) => {
        const next = { ...current };
        for (const message of messages)
          next[message.sender_id] = mergeEmojiMessages(
            next[message.sender_id] ?? [],
            [message],
          );
        return next;
      });
      if (active && peerId) {
        const latest = messages
          .filter((message) => message.sender_id === peerId)
          .at(-1);
        if (latest)
          void markEmojiRead(peerId, latest.id).catch(() => undefined);
      }
      const last = allowed.at(-1);
      if (!last) return;
      react(last.emoji);
      const sender = peers.find((peer) => peer.id === last.sender_id);
      if (!active || peerId !== last.sender_id)
        setNotice({
          peer: last.sender_id,
          name: sender?.name ?? "Одноклассник",
          emoji: last.emoji,
        });
    },
    [active, peerId, react],
  );
  const { peers, setPeers, ready, error, refresh } = useEmojiInbox(
    studentId,
    incoming,
  );
  const selected = peers.find((peer) => peer.id === peerId) ?? null;
  const messages = peerId ? (threads[peerId] ?? []) : [];
  useEffect(() => {
    if (active && narrow && selected)
      document.body.setAttribute("data-emoji-thread", "1");
    else document.body.removeAttribute("data-emoji-thread");
    return () => document.body.removeAttribute("data-emoji-thread");
  }, [active, narrow, selected]);
  const unread = peers.reduce((sum, peer) => sum + Number(peer.unread), 0);
  useEffect(() => {
    onUnread(unread);
  }, [unread, onUnread]);
  useEffect(() => {
    if (!active || !peerId) return;
    let keep = true;
    const target = peerId;
    const timer = setTimeout(() => setLoadingPeer(target), 0);
    void loadEmojiThread(target)
      .then(async (loaded) => {
        if (!keep) return;
        setThreadError(false);
        setThreads((current) => ({
          ...current,
          [target]: mergeEmojiMessages(current[target] ?? [], loaded),
        }));
        setCanLoadMore((current) => ({
          ...current,
          [target]: loaded.length === 40,
        }));
        const last = loaded
          .filter((message) => message.recipient_id === studentId)
          .at(-1);
        if (last && !document.hidden) {
          await markEmojiRead(target, last.id);
          if (keep) {
            setPeers((current) =>
              current.map((peer) =>
                peer.id === target ? { ...peer, unread: 0 } : peer,
              ),
            );
            void refresh();
          }
        }
      })
      .catch((reason) => {
        if (keep) {
          setThreadError(true);
          setFeedback({ type: "error", message: cloudError(reason) });
        }
      })
      .finally(() => {
        clearTimeout(timer);
        if (keep) setLoadingPeer(null);
      });
    return () => {
      keep = false;
      clearTimeout(timer);
    };
  }, [active, peerId, studentId, threadAttempt, setPeers, refresh]);
  useLayoutEffect(() => {
    const anchor = loadingOlder.current;
    if (anchor && scroll.current) {
      scroll.current.scrollTop =
        anchor.top + scroll.current.scrollHeight - anchor.height;
      loadingOlder.current = null;
    }
  }, [messages.length]);
  const lastMessage = messages.at(-1)?.id;
  useEffect(() => {
    if (!active || !nearBottom.current || !scroll.current) return;
    const container = scroll.current;
    const frame = requestAnimationFrame(() =>
      container.scrollTo({
        top: container.scrollHeight,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, peerId, lastMessage]);
  function preference(key: keyof Preferences) {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    try {
      localStorage.setItem("ml-emoji-preferences-v1", JSON.stringify(next));
    } catch {
      /* preference still works */
    }
    if (key === "sound") {
      if (next.sound) unlockEmojiAudio();
      else stopEmojiAudio();
    }
    if (key === "effects" && !next.effects) setBurst(null);
  }
  function openPeer(id: string) {
    currentPeer.current = id;
    nearBottom.current = true;
    setFeedback(null);
    setNotice(null);
    onOpen();
    startTransition(() => {
      addTransitionType("chat-open");
      setPeerId(id);
    });
  }
  function back() {
    currentPeer.current = null;
    setFeedback(null);
    startTransition(() => {
      addTransitionType("chat-back");
      setPeerId(null);
    });
  }
  async function send(
    emoji: ReactionEmoji,
    event?: MouseEvent<HTMLButtonElement>,
    retry?: PendingSend,
  ) {
    if (!selected || selected.blocked || locked.current) return;
    unlockEmojiAudio();
    locked.current = true;
    setSending(true);
    setFeedback(null);
    const target = selected.id;
    const nonce = retry?.nonce ?? crypto.randomUUID();
    const element = event?.currentTarget.getBoundingClientRect();
    const point = element
      ? { x: element.left + element.width / 2, y: element.top }
      : undefined;
    setPending({ peer: target, emoji, nonce, failed: false });
    try {
      const sent = await sendEmoji(target, emoji, nonce);
      if (!live.current) return;
      setThreads((current) => ({
        ...current,
        [target]: mergeEmojiMessages(current[target] ?? [], [sent]),
      }));
      setPending(null);
      nearBottom.current = true;
      react(emoji, point);
      void refresh();
    } catch (reason) {
      if (live.current) {
        setPending({ peer: target, emoji, nonce, failed: true });
        setFeedback({ type: "error", message: cloudError(reason) });
      }
    } finally {
      locked.current = false;
      if (live.current) setSending(false);
    }
  }
  async function loadOlder() {
    if (!peerId || older || !messages.length) return;
    setOlder(true);
    const target = peerId;
    try {
      const loaded = await loadEmojiThread(target, messages[0].id);
      if (!live.current) return;
      if (currentPeer.current === target && scroll.current)
        loadingOlder.current = {
          top: scroll.current.scrollTop,
          height: scroll.current.scrollHeight,
        };
      setThreads((current) => ({
        ...current,
        [target]: mergeEmojiMessages(current[target] ?? [], loaded),
      }));
      setCanLoadMore((current) => ({
        ...current,
        [target]: loaded.length === 40,
      }));
    } catch (reason) {
      setFeedback({ type: "error", message: cloudError(reason) });
    } finally {
      if (live.current) setOlder(false);
    }
  }
  async function block() {
    if (!selected || blocking) return;
    setBlocking(true);
    setFeedback(null);
    try {
      await blockEmojiPeer(selected.id, !selected.blocked);
      setPeers((current) =>
        current.map((peer) =>
          peer.id === selected.id
            ? { ...peer, blocked: !selected.blocked, unread: 0 }
            : peer,
        ),
      );
      setBurst(null);
      setNotice(null);
      await refresh();
    } catch (reason) {
      setFeedback({ type: "error", message: cloudError(reason) });
    } finally {
      if (live.current) setBlocking(false);
    }
  }
  const filtered = peers.filter((peer) =>
    peer.name
      .toLocaleLowerCase("ru-RU")
      .includes(query.trim().toLocaleLowerCase("ru-RU")),
  );
  const showList = !narrow || !selected;
  return (
    <>
      <section
        className="student-chats"
        data-thread-open={Boolean(narrow && selected)}
        hidden={!active}
        aria-label="Эмодзи-чаты"
      >
        <div className="chat-toolbar">
          <h2>Чаты</h2>
          <div className="chat-preferences">
            <button
              type="button"
              className="chat-icon-button"
              aria-label={
                preferences.sound
                  ? "Выключить звуки эмодзи"
                  : "Включить звуки эмодзи"
              }
              aria-pressed={preferences.sound}
              onClick={() => preference("sound")}
            >
              {preferences.sound ? (
                <Volume2 size={18} aria-hidden="true" />
              ) : (
                <VolumeX size={18} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="chat-icon-button"
              aria-label={
                preferences.effects
                  ? "Выключить анимации эмодзи"
                  : "Включить анимации эмодзи"
              }
              aria-pressed={preferences.effects}
              onClick={() => preference("effects")}
            >
              <Sparkles size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        {!ready ? (
          <div className="chat-empty" role="status">
            Загружаем чаты…
          </div>
        ) : error ? (
          <div className="chat-empty">
            <MessageCircle size={28} aria-hidden="true" />
            <h3>Чаты пока недоступны</h3>
            <p>{error}</p>
            <button
              type="button"
              className="teacher-button"
              onClick={() => void refresh()}
            >
              Попробовать ещё раз
            </button>
          </div>
        ) : (
          <div className="chat-layout" data-conversation={Boolean(selected)}>
            {showList && (
              <ViewTransition
                key="chat-list"
                default="none"
                enter={{ "chat-back": "chat-list-in", default: "none" }}
                exit={{ "chat-open": "chat-list-out", default: "none" }}
              >
                <div className="chat-people">
                  <div className="chat-search">
                    <Search size={17} aria-hidden="true" />
                    <input
                      name="chat-search"
                      type="search"
                      autoComplete="off"
                      aria-label="Поиск одноклассника"
                      placeholder="Найти одноклассника…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                  <ul>
                    {filtered.map((peer) => (
                      <li key={peer.id}>
                        <button
                          type="button"
                          className="chat-person"
                          aria-current={
                            selected?.id === peer.id ? "true" : undefined
                          }
                          onClick={() => openPeer(peer.id)}
                        >
                          <ChatAvatar peer={peer} shared={narrow} />
                          <span className="chat-person-copy">
                            <strong>{peer.name}</strong>
                            <small>
                              {peer.blocked
                                ? "Вы заблокировали эмодзи"
                                : peer.last_emoji
                                  ? `${peer.last_emoji} ${reactionName(peer.last_emoji)}`
                                  : "Отправить эмодзи"}
                            </small>
                          </span>
                          {peer.unread > 0 && (
                            <span
                              className="chat-unread"
                              aria-label={`${peer.unread} непрочитанных`}
                            >
                              {peer.unread > 99 ? "99+" : peer.unread}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!filtered.length && (
                    <p className="chat-no-peers">
                      {query
                        ? "Никого не нашли"
                        : "Здесь появятся одноклассники."}
                    </p>
                  )}
                </div>
              </ViewTransition>
            )}
            {selected ? (
              <ViewTransition
                key={`thread-${selected.id}`}
                default="none"
                enter={{
                  "chat-open": "chat-thread-in",
                  default: "workspace-tab-in",
                }}
                exit={{
                  "chat-back": "chat-thread-out",
                  default: "workspace-tab-out",
                }}
              >
                <div className="chat-conversation">
                  <header className="chat-thread-heading">
                    {narrow && (
                      <button
                        type="button"
                        className="chat-icon-button"
                        aria-label="К списку чатов"
                        onClick={back}
                      >
                        <ArrowLeft size={20} aria-hidden="true" />
                      </button>
                    )}
                    <ChatAvatar peer={selected} shared={narrow} />
                    <h3>{selected.name}</h3>
                    <details className="chat-person-menu">
                      <summary aria-label={`Настройки чата с ${selected.name}`}>
                        <ShieldOff size={18} aria-hidden="true" />
                      </summary>
                      <div>
                        <button
                          type="button"
                          disabled={blocking}
                          onClick={() => void block()}
                        >
                          <Ban size={16} aria-hidden="true" />
                          {selected.blocked
                            ? "Разблокировать"
                            : "Заблокировать эмодзи"}
                        </button>
                      </div>
                    </details>
                  </header>
                  <div
                    className="chat-scroll"
                    ref={scroll}
                    onScroll={(event) => {
                      const node = event.currentTarget;
                      nearBottom.current =
                        node.scrollHeight - node.scrollTop - node.clientHeight <
                        90;
                    }}
                  >
                    {threadError && (
                      <button
                        type="button"
                        className="chat-load-older"
                        onClick={() => setThreadAttempt((value) => value + 1)}
                      >
                        Повторить загрузку диалога
                      </button>
                    )}
                    {peerId && canLoadMore[peerId] && (
                      <button
                        type="button"
                        className="chat-load-older"
                        disabled={older}
                        onClick={() => void loadOlder()}
                      >
                        {older ? "Загружаем…" : "Раньше"}
                      </button>
                    )}
                    {loadingPeer === selected.id && !messages.length ? (
                      <p className="chat-history-status" role="status">
                        Загружаем диалог…
                      </p>
                    ) : !messages.length ? (
                      <div className="chat-thread-empty">
                        <span aria-hidden="true">👋</span>
                        <p>Отправь первый эмодзи</p>
                      </div>
                    ) : (
                      <ol className="chat-messages" aria-label="История эмодзи">
                        {messages.map((message, index) => {
                          const previous = messages[index - 1];
                          const day = date.format(new Date(message.sent_at));
                          const showDay =
                            !previous ||
                            date.format(new Date(previous.sent_at)) !== day;
                          return (
                            <li key={message.id} className="chat-message-entry">
                              {showDay && <div className="chat-day">{day}</div>}
                              <div
                                className="chat-message"
                                data-mine={message.sender_id === studentId}
                              >
                                <span
                                  className="chat-message-emoji"
                                  role="img"
                                  aria-label={reactionName(message.emoji)}
                                >
                                  {message.emoji}
                                </span>
                                <time dateTime={message.sent_at}>
                                  {time.format(new Date(message.sent_at))}
                                  {message.sender_id === studentId && (
                                    <Check size={11} aria-label="Отправлено" />
                                  )}
                                </time>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    {pending?.peer === selected.id && (
                      <div className="chat-pending" role="status">
                        <span aria-hidden="true">{pending.emoji}</span>
                        {pending.failed ? (
                          <button
                            type="button"
                            onClick={() =>
                              void send(pending.emoji, undefined, pending)
                            }
                          >
                            Повторить отправку
                          </button>
                        ) : (
                          "Отправляем…"
                        )}
                      </div>
                    )}
                  </div>
                  {selected.blocked ? (
                    <div className="chat-blocked">
                      <p>Вы заблокировали эмодзи от этого ученика.</p>
                      <button
                        type="button"
                        className="teacher-button"
                        disabled={blocking}
                        onClick={() => void block()}
                      >
                        Разблокировать
                      </button>
                    </div>
                  ) : (
                    <div
                      className="chat-composer"
                      role="group"
                      aria-label="Отправить эмодзи"
                    >
                      {EMOJI_REACTIONS.map((reaction) => (
                        <button
                          key={reaction.emoji}
                          type="button"
                          disabled={sending}
                          aria-label={`Отправить: ${reaction.name}`}
                          onClick={(event) => void send(reaction.emoji, event)}
                        >
                          <span aria-hidden="true">{reaction.emoji}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </ViewTransition>
            ) : (
              !narrow && (
                <div className="chat-select-empty">
                  <MessageCircle size={32} aria-hidden="true" />
                  <h3>Выбери одноклассника</h3>
                </div>
              )
            )}
          </div>
        )}
      </section>
      {burst && <EmojiBurst key={burst.id} event={burst} />}
      {notice && (
        <div className="emoji-notification" role="status">
          <button type="button" onClick={() => openPeer(notice.peer)}>
            <span aria-hidden="true">{notice.emoji}</span>
            <span>
              <strong>{notice.name}</strong>
              <small>Открыть чат</small>
            </span>
          </button>
          <button
            type="button"
            aria-label="Закрыть уведомление"
            onClick={() => setNotice(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </>
  );
}
