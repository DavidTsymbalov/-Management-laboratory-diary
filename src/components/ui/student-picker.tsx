"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { Student } from "@/data/seed";
export function StudentPicker({
  id,
  value,
  students,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  students: Student[];
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = students.find((student) => student.id === value);
  const options = students.filter((student) =>
    student.name
      .toLocaleLowerCase("ru-RU")
      .includes(query.trim().toLocaleLowerCase("ru-RU")),
  );
  const index = Math.min(active, Math.max(0, options.length - 1));
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (open)
      root.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [index, open]);
  function choose(student: Student) {
    onChange(student.id);
    setOpen(false);
    setQuery("");
    input.current?.focus();
  }
  return (
    <div className="student-picker" ref={root}>
      <div className="student-picker-control">
        <Search size={17} aria-hidden="true" />
        <input
          ref={input}
          id={id}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && options[index] ? `${uid}-${options[index].id}` : undefined
          }
          value={open ? query : (selected?.name ?? "")}
          placeholder={open ? "Поиск по имени…" : "Выберите ученика"}
          disabled={disabled}
          onFocus={() => {
            if (!disabled) {
              setQuery("");
              setActive(
                Math.max(
                  0,
                  students.findIndex((s) => s.id === value),
                ),
              );
              setOpen(true);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((current) =>
                Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    current + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              if (options[index]) choose(options[index]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            } else if (event.key === "Tab") setOpen(false);
            else if (open && (event.key === "Home" || event.key === "End")) {
              event.preventDefault();
              setActive(
                event.key === "Home" ? 0 : Math.max(0, options.length - 1),
              );
            }
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={
            open ? "Закрыть список учеников" : "Открыть список учеников"
          }
          tabIndex={-1}
          onClick={() => {
            if (open) setOpen(false);
            else {
              setQuery("");
              setActive(0);
              input.current?.focus();
              setOpen(true);
            }
          }}
        >
          <ChevronDown size={17} aria-hidden="true" />
        </button>
      </div>
      {open && !disabled && (
        <div className="student-picker-popup">
          <ul id={listId} role="listbox" aria-label="Ученики">
            {options.map((student, position) => (
              <li
                key={student.id}
                id={`${uid}-${student.id}`}
                role="option"
                aria-selected={student.id === value}
                data-active={position === index}
                onPointerMove={() => setActive(position)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(student)}
              >
                <span className="student-picker-avatar" aria-hidden="true">
                  {student.name
                    .split(" ")
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span>{student.name}</span>
                {student.id === value && <Check size={16} aria-hidden="true" />}
              </li>
            ))}
          </ul>
          {!options.length && <p>Никого не нашли</p>}
        </div>
      )}
    </div>
  );
}
