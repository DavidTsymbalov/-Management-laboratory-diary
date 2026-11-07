"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Shield, Smartphone, SquareTerminal } from "lucide-react";
import {
  getCloudRole,
  manageCloudStudents,
  signOutCloud,
  type CloudRole,
} from "@/lib/cloud-store";
import { getSupabase, cloudError } from "@/lib/supabase";
import {
  SECURITY_ACTIONS,
  deviceDescription,
  invokeSecurityAdmin,
  loadSecurityAccounts,
  loadSecurityDevices,
  loadSecurityEvents,
  revokeSecurityDevice,
  setSecurityAccount,
  type SecurityAccount,
  type SecurityDevice,
  type SecurityEvent,
} from "@/lib/security";
import {
  DEFAULT_CHAT_DISPLAY,
  type ChatDisplay,
} from "@/hooks/use-chat-display";
import { StudentPicker } from "@/components/ui/student-picker";
import { PasswordInput } from "@/components/ui/password-input";
import { FeedbackToast, type Feedback } from "@/components/ui/feedback-toast";
import { MfaForm } from "@/components/dashboard/mfa-form";
import type { Student } from "@/data/seed";
const format = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});
const logDate = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Moscow",
});
const logTime = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Moscow",
});
const roles: Record<string, string> = {
  teacher: "Преподаватель",
  csa: "CSA",
  admin: "Администратор",
  student: "Ученик",
  system: "Сервис",
};
type Tab = "events" | "devices" | "mfa" | "accounts" | "reactions";
const tabs = [
  { id: "events", label: "События" },
  { id: "devices", label: "Устройства" },
  { id: "mfa", label: "2FA" },
  { id: "accounts", label: "Аккаунты" },
  { id: "reactions", label: "Эмодзи" },
] as const;
export function SecurityPanel({
  actor,
  students,
}: {
  actor: CloudRole;
  students: Student[];
}) {
  const router = useRouter(),
    csa = actor.role === "csa";
  const [tab, setTab] = useState<Tab>("events"),
    [accounts, setAccounts] = useState<SecurityAccount[]>([]),
    [events, setEvents] = useState<SecurityEvent[]>([]),
    [devices, setDevices] = useState<SecurityDevice[]>([]),
    [accountId, setAccountId] = useState(actor.id),
    [filters, setFilters] = useState({ actor: "", target: "", action: "" }),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(false),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState<Feedback>(null),
    [mfaEnabled, setMfaEnabled] = useState(Boolean(actor.mfaEnrolled));
  const [password, setPassword] = useState(""),
    [staff, setStaff] = useState({
      role: "teacher",
      name: "",
      login: "",
      password: "",
    }),
    [display, setDisplay] = useState<ChatDisplay[]>(DEFAULT_CHAT_DISPLAY),
    [profile, setProfile] = useState({ name: actor.name, balance: "0" }),
    [removeAwards, setRemoveAwards] = useState<string[]>([]);
  const lock = useRef(false);
  const account = accounts.find((item) => item.id === accountId),
    pupil = students.find((item) => item.id === accountId);
  const accountOptions = accounts.map((item) => ({
    id: item.id,
    name: `${item.name} (${roles[item.role]})`,
  }));
  const refreshAccounts = useCallback(
    async () => setAccounts(await loadSecurityAccounts()),
    [],
  );
  useEffect(() => {
    let active = true;
    void loadSecurityAccounts()
      .then((data) => {
        if (active) setAccounts(data);
      })
      .catch((error) => {
        if (active) setFeedback({ type: "error", message: cloudError(error) });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (tab !== "events") return;
    let active = true;
    const timer = setTimeout(() => setLoading(true), 0);
    void loadSecurityEvents(filters)
      .then((data) => {
        if (active) {
          setEvents(data);
          setMore(data.length === 100);
        }
      })
      .catch((error) => {
        if (active) setFeedback({ type: "error", message: cloudError(error) });
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters, tab, attempt]);
  useEffect(() => {
    if (tab !== "devices") return;
    let active = true;
    const timer = setTimeout(() => setLoading(true), 0);
    void loadSecurityDevices(accountId)
      .then((data) => {
        if (active) setDevices(data);
      })
      .catch((error) => {
        if (active) {
          setDevices([]);
          setFeedback({ type: "error", message: cloudError(error) });
        }
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tab, accountId, attempt]);
  useEffect(() => {
    if (tab !== "reactions") return;
    let active = true;
    void getSupabase()
      .from("chat_reaction_display")
      .select("key,glyph,label")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setFeedback({ type: "error", message: cloudError(error) });
        else if (data?.length === 8)
          setDisplay(
            DEFAULT_CHAT_DISPLAY.map(
              (item) => data.find((value) => value.key === item.key) ?? item,
            ),
          );
      });
    return () => {
      active = false;
    };
  }, [tab, attempt]);
  function chooseAccount(id: string) {
    setAccountId(id);
    setPassword("");
    setFeedback(null);
    const student = students.find((item) => item.id === id);
    setProfile({
      name:
        student?.name ??
        accounts.find((account) => account.id === id)?.name ??
        "",
      balance: String(student?.nuts ?? 0),
    });
    setRemoveAwards([]);
  }
  async function run(action: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ type: "success", message });
      await refreshAccounts();
      setAttempt((value) => value + 1);
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function moreEvents() {
    if (loading) return;
    setLoading(true);
    try {
      const data = await loadSecurityEvents(filters, events.at(-1)?.id ?? null);
      setEvents((current) => [...current, ...data]);
      setMore(data.length === 100);
    } catch (error) {
      setFeedback({ type: "error", message: cloudError(error) });
    } finally {
      setLoading(false);
    }
  }
  function eventDetails(event: SecurityEvent) {
    const detail = event.details;
    if (event.action === "attendance_mark") {
      const marks: Record<string, string> = {
        present: "Присутствует",
        absent: "Отсутствует",
        late: "Опоздал",
        excused: "По уважительной причине",
      };
      return `${detail.lesson_date}: ${marks[String(detail.before)] ?? "Без отметки"} → ${marks[String(detail.after)] ?? "Без отметки"}`;
    }
    if (detail.limits && typeof detail.limits === "object") {
      const limits = detail.limits as Record<string, unknown>;
      return `Участников: ${limits.capacity}, удалений: ${limits.deleted}, баллов: ${limits.points}, наград: ${limits.awards}`;
    }
    if (event.action === "staff_created")
      return roles[String(detail.role)] ?? "Сотрудник";
    if (event.action === "points")
      return `${Number(detail.amount) >= 0 ? "+" : ""}${detail.amount} баллов: ${detail.before} → ${detail.after}`;
    if (event.action === "profile_changed")
      return `${detail.before_name} → ${detail.after_name}`;
    if (event.action === "reactions_changed")
      return "Изменены отображаемые реакции чатов";
    return typeof detail.title === "string" ? detail.title : "";
  }
  return (
    <section
      className="security-panel"
      onChangeCapture={() => setFeedback(null)}
    >
      <div className="security-heading">
        <h2>Безопасность{csa ? " · CSA" : ""}</h2>
        <button
          type="button"
          className="teacher-button subtle"
          disabled={busy || loading}
          onClick={() => setAttempt((value) => value + 1)}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Обновить
        </button>
      </div>
      <nav className="security-tabs" aria-label="Разделы безопасности">
        {tabs
          .filter((item) =>
            csa
              ? item.id !== "mfa"
              : !["accounts", "reactions"].includes(item.id),
          )
          .map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              disabled={busy}
              onClick={() => {
                setTab(item.id);
                setFeedback(null);
              }}
            >
              {item.label}
            </button>
          ))}
      </nav>
      {tab === "events" && (
        <>
          <div className="security-filters">
            <label>
              Кто выполнил
              <StudentPicker
                id="security-actor"
                value={filters.actor}
                students={accountOptions}
                placeholder="Все исполнители"
                disabled={busy}
                onChange={(id) =>
                  setFilters((current) => ({ ...current, actor: id }))
                }
              />
            </label>
            <label>
              Чей аккаунт
              <StudentPicker
                id="security-target"
                value={filters.target}
                students={accountOptions}
                placeholder="Все аккаунты"
                disabled={busy}
                onChange={(id) =>
                  setFilters((current) => ({ ...current, target: id }))
                }
              />
            </label>
            <label>
              Действие
              <select
                value={filters.action}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
              >
                <option value="">Все действия</option>
                {Object.entries(SECURITY_ACTIONS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="teacher-button subtle"
              onClick={() => setFilters({ actor: "", target: "", action: "" })}
            >
              Сбросить
            </button>
          </div>
          <div className="security-terminal">
            <div className="security-terminal-toolbar">
              <span>
                <SquareTerminal size={16} aria-hidden="true" />
                Событие --- Дата --- Время --- Устройство
              </span>
              <span role="status">
                {loading ? "Чтение…" : `Записей: ${events.length}`}
              </span>
            </div>
            {loading && !events.length ? (
              <p className="security-terminal-empty" role="status">
                Загружаем события…
              </p>
            ) : events.length ? (
              <ol className="security-events" aria-label="Журнал безопасности">
                {events.map((event) => {
                  const detail = eventDetails(event),
                    created = new Date(event.created_at);
                  return (
                    <li key={event.id}>
                      <span className="security-terminal-copy">
                        <strong>
                          {event.action === "points"
                            ? Number(event.details.amount) < 0
                              ? "Списание баллов"
                              : "Начисление баллов"
                            : (SECURITY_ACTIONS[event.action] ?? event.action)}
                        </strong>
                        {`: ${event.actor_name} (${roles[event.actor_role] ?? event.actor_role})`}
                        {event.target_name &&
                          event.target_id !== event.actor_id &&
                          ` → ${event.target_name}`}
                        {detail && `; ${detail}`}
                        {Boolean(event.details.outcome) && (
                          <span className="security-terminal-outcome">{`; ${event.details.outcome === "pending" ? "запрос начат" : event.details.outcome === "success" ? "выполнено" : "запрос завершился с ошибкой"}`}</span>
                        )}
                      </span>
                      <span
                        className="security-terminal-separator"
                        aria-hidden="true"
                      >
                        {" "}
                        ---{" "}
                      </span>
                      <time
                        className="security-terminal-date"
                        dateTime={event.created_at}
                      >
                        {logDate.format(created)}
                      </time>
                      <span
                        className="security-terminal-separator"
                        aria-hidden="true"
                      >
                        {" "}
                        ---{" "}
                      </span>
                      <time
                        className="security-terminal-time"
                        dateTime={event.created_at}
                      >
                        {logTime.format(created)}
                      </time>
                      <span
                        className="security-terminal-separator"
                        aria-hidden="true"
                      >
                        {" "}
                        ---{" "}
                      </span>
                      <span
                        className="security-terminal-device"
                        title={event.device ?? undefined}
                      >
                        {deviceDescription(event.device)}
                        {event.ip && ` · IP ${event.ip}`}
                        {event.session_id && (
                          <span
                            title={event.session_id}
                          >{` · сессия ${event.session_id.slice(0, 8)}`}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="security-terminal-empty">Подходящих событий нет.</p>
            )}
          </div>
          {more && (
            <button
              type="button"
              className="teacher-button"
              disabled={loading}
              onClick={() => void moreEvents()}
            >
              Раньше
            </button>
          )}
          <p className="teacher-hint security-context-note">
            Время по Москве. Браузер и IP описывают сессию и сами по себе не
            подтверждают личность.
          </p>
        </>
      )}
      {tab === "devices" && (
        <>
          <label className="security-account-picker">
            Аккаунт
            <StudentPicker
              id="security-device-account"
              value={accountId}
              students={accountOptions.filter(
                (item) =>
                  csa ||
                  item.id === actor.id ||
                  accounts.find((account) => account.id === item.id)?.role ===
                    "student" ||
                  accounts.find((account) => account.id === item.id)?.role ===
                    "admin",
              )}
              placeholder="Выберите аккаунт"
              disabled={busy}
              onChange={chooseAccount}
            />
          </label>
          {loading ? (
            <p role="status" className="teacher-empty">
              Загружаем устройства…
            </p>
          ) : (
            <ul className="security-devices">
              {devices.map((device) => (
                <li key={device.id}>
                  <Smartphone size={20} aria-hidden="true" />
                  <div>
                    <strong>{deviceDescription(device.device)}</strong>
                    {device.current && (
                      <span className="security-device-tag">
                        Это устройство
                      </span>
                    )}
                    <p>Вход: {format.format(new Date(device.created_at))}</p>
                    <p>
                      Обновление сессии:{" "}
                      {format.format(new Date(device.updated_at))}
                    </p>
                    {device.ip && <small>IP {device.ip}</small>}
                  </div>
                  <button
                    type="button"
                    className="teacher-button"
                    disabled={busy || device.revoked}
                    onClick={() =>
                      void run(async () => {
                        await revokeSecurityDevice(device.id);
                        if (device.current) {
                          await signOutCloud();
                          router.replace(`/${actor.role}/`);
                        }
                      }, "Сессия завершена.")
                    }
                  >
                    {device.revoked ? "Завершена" : "Завершить сессию"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && !devices.length && (
            <p className="teacher-empty">Активных сессий нет.</p>
          )}
        </>
      )}
      {tab === "mfa" && !csa && (
        <>
          {mfaEnabled ? (
            <div className="security-mfa-enabled">
              <Shield size={22} aria-hidden="true" />
              <div>
                <h3>Двухфакторная защита включена</h3>
                <p className="teacher-hint">
                  Для входа требуется пароль и код из
                  приложения-аутентификатора.
                </p>
              </div>
            </div>
          ) : (
            <MfaForm
              enrolled={false}
              onVerified={async () => {
                const role = await getCloudRole();
                setMfaEnabled(Boolean(role?.mfaEnrolled));
              }}
            />
          )}
        </>
      )}
      {tab === "accounts" && csa && (
        <>
          <label className="security-account-picker">
            Аккаунт
            <StudentPicker
              id="security-managed-account"
              value={accountId}
              students={accountOptions}
              placeholder="Выберите аккаунт"
              disabled={busy}
              onChange={chooseAccount}
            />
          </label>
          {account && (
            <section className="security-account-controls">
              <div className="security-account-description">
                <h3>{account.name}</h3>
                <p>
                  {roles[account.role]}
                  {account.login ? ` · логин ${account.login}` : ""}
                  {account.disabled ? " · заблокирован" : ""}
                </p>
              </div>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    if (
                      password.length < (pupil ? 8 : 12) ||
                      password.length > 128
                    )
                      throw new Error(
                        `Пароль — от ${pupil ? 8 : 12} до 128 символов.`,
                      );
                    await manageCloudStudents({
                      action: "password",
                      id: accountId,
                      password,
                    });
                    setPassword("");
                  }, "Пароль изменён. Прежние сессии отозваны.");
                }}
              >
                <label>
                  Новый пароль
                  <PasswordInput
                    value={password}
                    autoComplete="new-password"
                    disabled={busy}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="teacher-button"
                  disabled={busy}
                >
                  Изменить пароль
                </button>
              </form>
              {!pupil && (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      const { error } = await getSupabase().rpc(
                        "csa_rename_staff",
                        { target_user: accountId, display_name: profile.name },
                      );
                      if (error) throw error;
                    }, "Имя сотрудника изменено.");
                  }}
                >
                  <label>
                    Отображаемое имя
                    <input
                      value={profile.name}
                      placeholder={account.name}
                      maxLength={200}
                      disabled={busy}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="teacher-button"
                    type="submit"
                    disabled={busy}
                  >
                    Сохранить имя
                  </button>
                </form>
              )}
              {pupil && (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      const balance = Number(profile.balance);
                      if (
                        !profile.name.trim() ||
                        !Number.isInteger(balance) ||
                        balance < 0 ||
                        balance > 1000000000
                      )
                        throw new Error("Проверьте имя и баланс.");
                      const { error } = await getSupabase().rpc(
                        "csa_update_student",
                        {
                          target_student: accountId,
                          display_name: profile.name,
                          new_balance: balance,
                          remove_awards: removeAwards,
                        },
                      );
                      if (error) throw error;
                      setRemoveAwards([]);
                    }, "Данные ученика изменены.");
                  }}
                >
                  <div className="security-profile-fields">
                    <label>
                      Отображаемое имя
                      <input
                        value={profile.name}
                        maxLength={200}
                        disabled={busy}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Баланс
                      <input
                        type="number"
                        min={0}
                        max={1000000000}
                        value={profile.balance}
                        disabled={busy}
                        onChange={(event) =>
                          setProfile((current) => ({
                            ...current,
                            balance: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  {pupil.achievements.length > 0 && (
                    <fieldset className="security-award-removal">
                      <legend>Награды для удаления</legend>
                      {pupil.achievements.map((award) => (
                        <label key={award.id}>
                          <input
                            type="checkbox"
                            checked={removeAwards.includes(award.id)}
                            disabled={busy}
                            onChange={() =>
                              setRemoveAwards((current) =>
                                current.includes(award.id)
                                  ? current.filter((id) => id !== award.id)
                                  : [...current, award.id],
                              )
                            }
                          />
                          {award.title}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <button
                    type="submit"
                    className="teacher-button"
                    disabled={busy}
                  >
                    Сохранить данные ученика
                  </button>
                </form>
              )}
              <div className="security-account-actions">
                <button
                  type="button"
                  className="teacher-button"
                  disabled={busy || accountId === actor.id}
                  onClick={() =>
                    void run(
                      () => setSecurityAccount(accountId, account.disabled),
                      account.disabled
                        ? "Аккаунт разблокирован. Для доступа нужен новый вход."
                        : "Аккаунт заблокирован.",
                    )
                  }
                >
                  {account.disabled
                    ? "Разблокировать"
                    : "Заблокировать аккаунт"}
                </button>
                <button
                  type="button"
                  className="teacher-button"
                  disabled={busy || accountId === actor.id || !account.mfa}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Сбросить 2FA у ${account.name} и отозвать его сессии?`,
                      )
                    )
                      void run(
                        () =>
                          invokeSecurityAdmin({
                            action: "mfa_reset",
                            id: accountId,
                          }),
                        "2FA сброшена. Прежние сессии отозваны.",
                      );
                  }}
                >
                  Сбросить 2FA
                </button>
                <button
                  type="button"
                  className="teacher-button subtle"
                  disabled={busy || accountId === actor.id}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Удалить аккаунт ${account.name}? Это действие необратимо.`,
                      )
                    )
                      void run(
                        () =>
                          invokeSecurityAdmin({
                            action: "account_delete",
                            id: accountId,
                          }),
                        "Аккаунт удалён.",
                      );
                  }}
                >
                  Удалить аккаунт
                </button>
              </div>
            </section>
          )}
          <section className="security-create-staff">
            <h3>Создать сотрудника</h3>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await invokeSecurityAdmin({
                    action: "staff_create",
                    ...staff,
                  });
                  setStaff({
                    role: "teacher",
                    name: "",
                    login: "",
                    password: "",
                  });
                }, "Аккаунт сотрудника создан.");
              }}
            >
              <label>
                Роль
                <select
                  value={staff.role}
                  disabled={busy}
                  onChange={(event) =>
                    setStaff((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                >
                  <option value="teacher">Преподаватель</option>
                  <option value="csa">CSA</option>
                </select>
              </label>
              <label>
                Имя
                <input
                  value={staff.name}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) =>
                    setStaff((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Логин
                <input
                  value={staff.login}
                  autoComplete="off"
                  autoCapitalize="none"
                  disabled={busy}
                  onChange={(event) =>
                    setStaff((current) => ({
                      ...current,
                      login: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Пароль
                <PasswordInput
                  value={staff.password}
                  autoComplete="new-password"
                  disabled={busy}
                  onChange={(event) =>
                    setStaff((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="submit"
                className="teacher-button primary"
                disabled={busy}
              >
                Создать сотрудника
              </button>
            </form>
          </section>
        </>
      )}
      {tab === "reactions" && csa && (
        <form
          noValidate
          className="security-reactions"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              for (const item of display) {
                const glyph = item.glyph.trim();
                if (
                  [
                    ...new Intl.Segmenter("ru", {
                      granularity: "grapheme",
                    }).segment(glyph),
                  ].length !== 1 ||
                  !/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(
                    glyph,
                  )
                )
                  throw new Error("В каждом слоте должен быть один эмодзи.");
              }
              const { error } = await getSupabase().rpc(
                "csa_reaction_display",
                { items: display },
              );
              if (error) throw error;
            }, "Эмодзи чатов изменены.");
          }}
        >
          <p className="teacher-hint">
            Изменение действует на панель, историю и анимации у всех учеников.
          </p>
          <div className="security-reaction-fields">
            {display.map((item, index) => (
              <div key={item.key}>
                <span aria-hidden="true">{item.glyph}</span>
                <label>
                  Эмодзи
                  <input
                    value={item.glyph}
                    maxLength={32}
                    disabled={busy}
                    onChange={(event) =>
                      setDisplay((current) =>
                        current.map((value, i) =>
                          i === index
                            ? { ...value, glyph: event.target.value }
                            : value,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Название
                  <input
                    value={item.label}
                    maxLength={50}
                    disabled={busy}
                    onChange={(event) =>
                      setDisplay((current) =>
                        current.map((value, i) =>
                          i === index
                            ? { ...value, label: event.target.value }
                            : value,
                        ),
                      )
                    }
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="teacher-inline-actions">
            <button
              className="teacher-button primary"
              type="submit"
              disabled={busy}
            >
              Сохранить эмодзи
            </button>
            <button
              className="teacher-button subtle"
              type="button"
              disabled={busy}
              onClick={() => setDisplay(DEFAULT_CHAT_DISPLAY)}
            >
              Исходные эмодзи
            </button>
          </div>
        </form>
      )}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}
